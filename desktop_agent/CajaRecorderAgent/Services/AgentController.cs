using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Threading;
using System.Windows;
using CajaRecorderAgent.Models;
using CajaRecorderAgent.Views;

namespace CajaRecorderAgent.Services;

public class AgentController
{
    private readonly SettingsService _settingsService = new();
    private readonly ScheduleService _scheduleService = new();
    private readonly RecorderService _recorder = new();
    private readonly IndicatorWindow _indicator;

    private AppSettings _settings;
    private readonly DispatcherTimer _timer;
    private readonly DispatcherTimer _serverCheckTimer;

    private bool _manualHold = false;
    private DateTime? _segmentStart;
    private readonly TimeSpan _segmentDuration = TimeSpan.FromMinutes(10);
    private bool _tickBusy = false;
    private bool _isTransmitting = false;

    // Serializar envíos para que no choquen segmentos
    private readonly SemaphoreSlim _uploadLock = new(1, 1);

    private DateTime GetEcuadorTime()
    {
        return ApiClient.ServerUtcNow.AddHours(-5);
    }

    public RecorderState State => _recorder.State;
    public string Caja => _settings.NumeroCaja;
    public string Cajero => _settings.Cajero;

    public AgentController(IndicatorWindow indicator)
    {
        _indicator = indicator;
        _settings = SafeLoadSettings();

        _recorder.OnStateChanged += s =>
        {
            if (s == RecorderState.Recording) _indicator.SetRecording();
            else if (s == RecorderState.Paused) _indicator.SetPaused();
            else if (s == RecorderState.Error) _indicator.SetMicError("Fallo al acceder al micrófono.");
            else _indicator.SetStopped();
        };

        // Cuando se cierra un segmento, lo mandamos a la API (ingest) y opcionalmente bajamos el enhanced
        _recorder.OnSegmentClosed += (filePath, startedAtUtc, endedAtUtc) =>
        {
            var adjustedStart = startedAtUtc + ApiClient.ServerTimeOffset;
            var adjustedEnd = endedAtUtc + ApiClient.ServerTimeOffset;
            _ = UploadSegmentAsync(filePath, adjustedStart, adjustedEnd);
        };

        _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        _timer.Tick += async (_, __) => await TickAsync();

        _serverCheckTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        _serverCheckTimer.Tick += async (_, __) => await CheckServerConnectionAsync();
    }

    public void Start()
    {
        _timer.Start();
        _serverCheckTimer.Start();
        _ = TickAsync();
        _ = CheckServerConnectionAsync();
    }

    private async Task CheckServerConnectionAsync()
    {
        _settings = SafeLoadSettings();
        if (string.IsNullOrWhiteSpace(_settings.ApiBaseUrl)) return;
        try
        {
            var api = new ApiClient(_settings.ApiBaseUrl, _settings.ApiTimeoutSeconds);
            var (isConnected, error) = await api.CheckConnectionAsync();
            _indicator.SetServerConnection(isConnected, error);

            if (isConnected && !string.IsNullOrWhiteSpace(_settings.CajaId))
            {
                try {
                    bool isRecording = _recorder.State == RecorderState.Recording;
                    string estadoGrabacion = GetEstadoGrabacion();
                    var pingResult = await api.PingAsync(_settings.CajaId, isRecording, estadoGrabacion);
                    
                    bool changed = false;
                    if (!string.IsNullOrEmpty(pingResult.EstadoOperativo) && pingResult.EstadoOperativo != _settings.EstadoOperativo)
                    {
                        _settings.EstadoOperativo = pingResult.EstadoOperativo;
                        changed = true;
                    }
                    if (pingResult.ContactoId != _settings.CajeroId || pingResult.CajeroNombre != _settings.Cajero)
                    {
                        LogService.Info($"Cambio de cajero detectado: anterior={_settings.Cajero}, nuevo={pingResult.CajeroNombre}");
                        
                        // Si está grabando actualmente, detenemos para cerrar el segmento del cajero anterior
                        if (_recorder.State == RecorderState.Recording)
                        {
                            LogService.Info("Deteniendo grabación actual para rotar archivo con el cajero anterior.");
                            await _recorder.StopAsync();
                        }

                        _settings.CajeroId = pingResult.ContactoId;
                        _settings.Cajero = pingResult.CajeroNombre;
                        changed = true;
                        
                        if (string.IsNullOrEmpty(pingResult.ContactoId) && (_settings.EstadoOperativo == "En Mantenimiento" || _settings.EstadoOperativo == "Fuera de Servicio"))
                        {
                            if (_recorder.State == RecorderState.Recording || _recorder.State == RecorderState.Paused)
                                await _recorder.StopAsync();
                        }
                    }

                    if (TimeSpan.TryParse(pingResult.TurnoMananaInicio, out var tmi) && tmi != _settings.TurnoMananaInicio)
                    {
                        _settings.TurnoMananaInicio = tmi;
                        changed = true;
                    }
                    if (TimeSpan.TryParse(pingResult.TurnoMananaFin, out var tmf) && tmf != _settings.TurnoMananaFin)
                    {
                        _settings.TurnoMananaFin = tmf;
                        changed = true;
                    }
                    if (TimeSpan.TryParse(pingResult.TurnoTardeInicio, out var tti) && tti != _settings.TurnoTardeInicio)
                    {
                        _settings.TurnoTardeInicio = tti;
                        changed = true;
                    }
                    if (TimeSpan.TryParse(pingResult.TurnoTardeFin, out var ttf) && ttf != _settings.TurnoTardeFin)
                    {
                        _settings.TurnoTardeFin = ttf;
                        changed = true;
                    }

                    if (pingResult.GrabacionHabilitada != _settings.GrabacionHabilitada)
                    {
                        _settings.GrabacionHabilitada = pingResult.GrabacionHabilitada;
                        changed = true;
                    }

                    // Pausa sincronizada desde el administrador
                    if (pingResult.EnPausa != _manualHold)
                    {
                        if (pingResult.EnPausa)
                        {
                            LogService.Info("Pausa remota detectada desde el servidor.");
                            PauseManually();
                        }
                        else
                        {
                            LogService.Info("Reanudación remota detectada desde el servidor.");
                            ResumeRemotely();
                        }
                    }

                    if (changed)
                    {
                        _settingsService.Save(_settings);
                        LogService.Info($"Sincronizado desde el servidor: Estado={_settings.EstadoOperativo}, CajeroId={_settings.CajeroId}, Cajero={_settings.Cajero}, Horarios, GrabacionHabilitada={_settings.GrabacionHabilitada}");
                    }

                } catch(Exception px) {
                    LogService.Warn("Ping falló: " + px.Message);
                }
            }
        }
        catch (Exception ex)
        {
            _indicator.SetServerConnection(false, ex.Message);
        }
    }

    private string GetEstadoGrabacion()
    {
        if (!_settings.GrabacionHabilitada)
            return "apagado";
            
        if (_settings.EstadoOperativo == "En Mantenimiento" || _settings.EstadoOperativo == "Fuera de Servicio")
            return "apagado";
            
        if (string.IsNullOrWhiteSpace(_settings.CajeroId))
            return "apagado";

        var within = _scheduleService.IsWithinSchedule(_settings, GetEcuadorTime());
        if (!within)
            return "fuera de horario";

        if (_manualHold || _recorder.State == RecorderState.Paused)
            return "pausa";

        if (_isTransmitting)
            return "transmitiendo";

        if (_recorder.State == RecorderState.Recording)
            return "grabando";

        return "apagado";
    }

    private AppSettings SafeLoadSettings()
    {
        try { return _settingsService.Load(); }
        catch (Exception ex)
        {
            LogService.Error("SafeLoadSettings failed, using defaults.", ex);
            return new AppSettings();
        }
    }

    private async Task TickAsync()
    {
        if (_tickBusy) return;
        _tickBusy = true;

        try
        {
            _settings = SafeLoadSettings();

            if (!_settings.GrabacionHabilitada || _settings.EstadoOperativo == "En Mantenimiento" || _settings.EstadoOperativo == "Fuera de Servicio" || string.IsNullOrWhiteSpace(_settings.CajeroId))
            {
                if (_recorder.State == RecorderState.Recording || _recorder.State == RecorderState.Paused)
                    await _recorder.StopAsync();

                if (!_settings.GrabacionHabilitada)
                    _indicator.SetPoweredOff();
                else if (_settings.EstadoOperativo == "En Mantenimiento" || _settings.EstadoOperativo == "Fuera de Servicio")
                    _indicator.SetStopped(); // could set a specific state
                else if (string.IsNullOrWhiteSpace(_settings.CajeroId))
                    _indicator.SetStopped(); // Stop if no cashier is assigned

                _segmentStart = null;
                return;
            }

            var within = _scheduleService.IsWithinSchedule(_settings, GetEcuadorTime());
            if (!within)
            {
                if (_recorder.State == RecorderState.Recording || _recorder.State == RecorderState.Paused)
                    await _recorder.StopAsync();
                _segmentStart = null;
                return;
            }

            if (_manualHold) return;

            if (!int.TryParse(_settings.MicrophoneId, out var micId))
            {
                LogService.Warn("MicrophoneId invalid, cannot record.");
                if (_recorder.State == RecorderState.Recording || _recorder.State == RecorderState.Paused)
                    await _recorder.StopAsync();
                
                _indicator.SetMicError("Micrófono no configurado o inválido.");
                _segmentStart = null;
                return;
            }

            // Rotación cada 10 min
            if (_recorder.State == RecorderState.Recording && _segmentStart.HasValue)
            {
                if (GetEcuadorTime() - _segmentStart.Value >= _segmentDuration)
                {
                    LogService.Info("Segment rotation triggered (10min).");
                    await _recorder.StopAsync(); // OnSegmentClosed dispara UploadSegmentAsync

                    var fileNew = BuildFilePath();
                    _recorder.StartRecording(micId, fileNew);
                    _segmentStart = GetEcuadorTime();
                    return;
                }
            }

            if (_recorder.State == RecorderState.Stopped || _recorder.State == RecorderState.Error)
            {
                var file = BuildFilePath();
                _recorder.StartRecording(micId, file);
                _segmentStart = GetEcuadorTime();
            }
            else if (_recorder.State == RecorderState.Paused)
            {
                var file = BuildFilePath();
                _recorder.StartRecording(micId, file);
                _segmentStart = GetEcuadorTime();
            }
        }
        catch (Exception ex)
        {
            LogService.Error("TickAsync failed", ex);
        }
        finally
        {
            _tickBusy = false;
        }
    }

    private string BuildFilePath()
    {
        var ts = GetEcuadorTime().ToString("yyyyMMdd_HHmmss");
        var caja = Sanitize(_settings.NumeroCaja);
        var cajero = Sanitize(_settings.Cajero);
        var fileName = $"{ts}_Caja{caja}_Cajero{cajero}.wav";
        return Path.Combine(_settings.OutputFolder, GetEcuadorTime().ToString("yyyyMMdd"), fileName);
    }

    private static string Sanitize(string s)
    {
        foreach (var c in Path.GetInvalidFileNameChars())
            s = s.Replace(c, '_');
        return string.IsNullOrWhiteSpace(s) ? "NA" : s;
    }

    /// <summary>
    /// CAMINO B (ANTI-COLAPSO):
    /// - POST /audio/ingest (API solo recibe + encola)
    /// - Worker Enhance procesa en segundo plano
    /// - (Opcional) Cliente descarga /audio/{id}/enhanced cuando exista
    /// </summary>
    private async Task UploadSegmentAsync(string filePath, DateTime startedAtUtc, DateTime endedAtUtc)
    {
        // Evita subir archivos muy pequeños
        try
        {
            var fi = new FileInfo(filePath);
            if (!fi.Exists || fi.Length < 32_000) // ~1s aprox
            {
                LogService.Warn($"Skip upload (file too small): {filePath}");
                return;
            }
        }
        catch { }

        _settings = SafeLoadSettings();
        var activeCajero = ExtractCajeroFromPath(filePath, _settings.Cajero);

        // Si no hay cajero asignado, no enviamos al servidor
        if (string.IsNullOrWhiteSpace(activeCajero))
        {
            LogService.Warn($"Skip upload: No hay cajero asignado para la caja {_settings.NumeroCaja}");
            _indicator.SetError("Local (Sin Cajero). No se envió.");
            
            try
            {
                var noCajeroFolder = Path.Combine(_settings.OutputFolder, "Grabaciones_Sin_Cajero", GetEcuadorTime().ToString("yyyyMMdd"));
                Directory.CreateDirectory(noCajeroFolder);
                var noCajeroPath = Path.Combine(noCajeroFolder, Path.GetFileName(filePath));
                if (File.Exists(filePath)) File.Move(filePath, noCajeroPath, overwrite: true);
            }
            catch (Exception moveEx)
            {
                LogService.Error("Failed to move file to sin cajero folder", moveEx);
            }
            return;
        }

        await _uploadLock.WaitAsync();
        _isTransmitting = true;
        _indicator.SetTransmitting(true);
        string? grabacionId = null;
        try
        {
            _settings = SafeLoadSettings();

            var api = new ApiClient(_settings.ApiBaseUrl, _settings.ApiTimeoutSeconds);

            // 1) Ingest — rápido: guarda archivo + registra en BD + encola en servidor
            var ingest = await api.IngestAudioAsync(
                caja: _settings.NumeroCaja,
                cajero: activeCajero,
                startedAtUtc: startedAtUtc,
                endedAtUtc: endedAtUtc,
                inputWavPath: filePath
            );

            grabacionId = ingest.GrabacionId;
            LogService.Info($"Ingest OK. grabacion_id={grabacionId}, estado={ingest.Estado}");

            // Move to OK folder
            var okFolder = Path.Combine(_settings.OutputFolder, "Grabaciones_Enviadas_OK", GetEcuadorTime().ToString("yyyyMMdd"));
            Directory.CreateDirectory(okFolder);
            var okPath = Path.Combine(okFolder, Path.GetFileName(filePath));
            if (File.Exists(filePath)) File.Move(filePath, okPath, overwrite: true);
            filePath = okPath; // update for PollEnhancedAsync if needed
        }
        catch (Exception ex)
        {
            LogService.Error("UploadSegmentAsync (ingest) failed", ex);
            
            _indicator.SetError($"Error al subir:\n{ex.Message}");

            // Move to Pending folder
            try
            {
                var pendingFolder = Path.Combine(_settings.OutputFolder, "Grabaciones_Pendientes_Manual", GetEcuadorTime().ToString("yyyyMMdd"));
                Directory.CreateDirectory(pendingFolder);
                var pendingPath = Path.Combine(pendingFolder, Path.GetFileName(filePath));
                if (File.Exists(filePath)) File.Move(filePath, pendingPath, overwrite: true);
            }
            catch (Exception moveEx)
            {
                LogService.Error("Failed to move file to pending folder", moveEx);
            }
            
            return;
        }
        finally
        {
            _indicator.SetTransmitting(false);
            _isTransmitting = false;
            // CRÍTICO: liberar semáforo SIEMPRE después del ingest,
            // no bloquear durante el polling del enhanced (hasta 60s)
            _uploadLock.Release();
        }

        // 2) (Opcional) Descargar el audio mejorado cuando el worker lo genere.
        //    Corre en background — NO bloquea el próximo upload de 10min.
        //    Si no necesitas el enhanced en la caja, puedes eliminar este bloque.
        if (!string.IsNullOrWhiteSpace(grabacionId))
        {
            _ = PollEnhancedAsync(grabacionId, filePath);
        }
    }

    private async Task PollEnhancedAsync(string grabacionId, string originalFilePath)
    {
        try
        {
            var settings = SafeLoadSettings();
            var enhancedFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "CajaRecorderAgent", "recordings_enhanced", GetEcuadorTime().ToString("yyyyMMdd")
            );

            var enhancedName = Path.GetFileNameWithoutExtension(originalFilePath) + "_ENH.wav";
            var enhancedPath = Path.Combine(enhancedFolder, enhancedName);

            // Polling: 12 intentos cada 5s (60s máximo) — en segundo plano
            var api = new ApiClient(settings.ApiBaseUrl, settings.ApiTimeoutSeconds);
            for (int i = 0; i < 12; i++)
            {
                await Task.Delay(TimeSpan.FromSeconds(5));

                try
                {
                    await api.DownloadEnhancedAsync(grabacionId, enhancedPath);
                    LogService.Info($"Enhanced descargado: {enhancedPath}");
                    return;
                }
                catch (Exception ex)
                {
                    LogService.Warn($"Enhanced no listo (intento {i + 1}/12): {ex.Message}");
                }
            }

            LogService.Warn($"No se logró descargar enhanced en 60s. Disponible en servidor. grabacion_id={grabacionId}");
        }
        catch (Exception ex)
        {
            LogService.Error("PollEnhancedAsync failed", ex);
        }
    }

    // Manuales
    public async void PauseManually()
    {
        _manualHold = true;
        _segmentStart = null;
        if (_recorder.State == RecorderState.Recording)
            await _recorder.PauseAsync();
        LogService.Info("PauseManually executed.");
    }

    public async void ResumeManually()
    {
        _manualHold = false;
        _settings = SafeLoadSettings();
        
        // Si el usuario presiona "Reanudar", implícitamente quiere habilitar la grabación de nuevo
        if (!_settings.GrabacionHabilitada)
        {
            _settings.GrabacionHabilitada = true;
            _settingsService.Save(_settings);
        }

        if (!int.TryParse(_settings.MicrophoneId, out var micId))
        {
            MessageBox.Show("No se puede reanudar la grabación porque no se ha seleccionado un micrófono en la configuración.", 
                "Micrófono no configurado", MessageBoxButton.OK, MessageBoxImage.Warning);
            _indicator.SetMicError("Micrófono no configurado.");
            return;
        }

        if (_recorder.State == RecorderState.Recording)
            await _recorder.StopAsync();

        var within = _scheduleService.IsWithinSchedule(_settings, GetEcuadorTime());
        if (!within)
        {
            MessageBox.Show("La hora actual está fuera del horario de grabación.\nRevise la Configuración de Horarios si desea grabar ahora.", 
                "Horario inactivo", MessageBoxButton.OK, MessageBoxImage.Information);
            _indicator.SetStopped();
            return;
        }

        var file = BuildFilePath();
        _recorder.StartRecording(micId, file);
        _segmentStart = GetEcuadorTime();
        LogService.Info("ResumeManually executed (new file).");
    }

    public async void StopManually()
    {
        _manualHold = true;
        _segmentStart = null;
        if (_recorder.State == RecorderState.Recording || _recorder.State == RecorderState.Paused)
            await _recorder.StopAsync();
        LogService.Info("StopManually executed.");
    }

    public void OpenSettingsWithAuth()
    {
        var settingsWin = new SettingsWindow(_settings);
        var ok = settingsWin.ShowDialog() == true;

        if (ok)
        {
            _settings = SafeLoadSettings();
            _manualHold = false;
            _ = TickAsync();
            LogService.Info("Settings updated via SettingsWindow.");
        }
    }

    public async void PowerOffManually()
    {
        _manualHold = true;
        _segmentStart = null;

        if (_recorder.State == RecorderState.Recording || _recorder.State == RecorderState.Paused)
            await _recorder.StopAsync();

        _settings = SafeLoadSettings();
        _settings.GrabacionHabilitada = false;
        _settingsService.Save(_settings);

        _indicator.SetPoweredOff();
        LogService.Info("PowerOffManually executed (GrabacionHabilitada=false).");
    }

    private async void ResumeRemotely()
    {
        _manualHold = false;
        _settings = SafeLoadSettings();
        
        if (!_settings.GrabacionHabilitada)
        {
            _settings.GrabacionHabilitada = true;
            _settingsService.Save(_settings);
        }

        if (!int.TryParse(_settings.MicrophoneId, out var micId))
        {
            LogService.Warn("MicrophoneId invalid, cannot record remotely.");
            _indicator.SetMicError("Micrófono no configurado.");
            return;
        }

        if (_recorder.State == RecorderState.Recording)
            await _recorder.StopAsync();

        var within = _scheduleService.IsWithinSchedule(_settings, GetEcuadorTime());
        if (!within)
        {
            LogService.Info("Remote resume skipped: Current time is outside recording schedule.");
            _indicator.SetStopped();
            return;
        }

        var file = BuildFilePath();
        _recorder.StartRecording(micId, file);
        _segmentStart = GetEcuadorTime();
        LogService.Info("ResumeRemotely executed silently.");
    }

    private static string ExtractCajeroFromPath(string filePath, string fallback)
    {
        try
        {
            var nameOnly = Path.GetFileNameWithoutExtension(filePath);
            var index = nameOnly.IndexOf("_Cajero", StringComparison.OrdinalIgnoreCase);
            if (index != -1 && nameOnly.Length > index + 7)
            {
                var parsed = nameOnly.Substring(index + 7);
                if (!string.IsNullOrWhiteSpace(parsed) && parsed != "NA")
                {
                    return parsed.Replace('_', ' ').Trim();
                }
            }
        }
        catch (Exception ex)
        {
            LogService.Warn($"Failed to extract cajero from path {filePath}: {ex.Message}");
        }
        return fallback;
    }
}
