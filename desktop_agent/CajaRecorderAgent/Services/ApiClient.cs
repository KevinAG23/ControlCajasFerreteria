using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using CajaRecorderAgent.Models;
using System.IO;



namespace CajaRecorderAgent.Services;

public class ApiClient
{
    private readonly HttpClient _http;
    private readonly JsonSerializerOptions _jsonOpts = new(JsonSerializerDefaults.Web);

    public static TimeSpan ServerTimeOffset { get; private set; } = TimeSpan.Zero;
    public static DateTime ServerUtcNow => DateTime.UtcNow + ServerTimeOffset;

    private void UpdateServerTimeOffset(HttpResponseMessage response)
    {
        try
        {
            if (response.Headers.Date.HasValue)
            {
                var serverTime = response.Headers.Date.Value.UtcDateTime;
                var localTime = DateTime.UtcNow;
                ServerTimeOffset = serverTime - localTime;
                LogService.Info($"Sincronización de tiempo: Server={serverTime:o}, Local={localTime:o}, Offset={ServerTimeOffset.TotalSeconds}s");
            }
        }
        catch (Exception ex)
        {
            LogService.Error("Error al sincronizar tiempo con el servidor", ex);
        }
    }

    public ApiClient(string baseUrl, int timeoutSeconds)
    {
        if (string.IsNullOrWhiteSpace(baseUrl))
            throw new ArgumentException("La URL del servidor no puede estar vacía.");

        if (!Uri.TryCreate(baseUrl.TrimEnd('/') + "/", UriKind.Absolute, out var uri) || 
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            throw new ArgumentException("La URL del servidor no es válida. Debe iniciar con http:// o https://");
        }

        _http = new HttpClient
        {
            BaseAddress = uri,
            Timeout = TimeSpan.FromSeconds(Math.Clamp(timeoutSeconds, 3, 10))
        };
    }

    private void ApplyAuth()
    {
        _http.DefaultRequestHeaders.Authorization = null;
        if (SessionService.IsAuthenticated)
        {
            _http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", SessionService.AccessToken);
        }
    }

    public async Task<(bool IsConnected, string ErrorReason)> CheckConnectionAsync()
    {
        try
        {
            // Timeout de 1.5s para respuesta rápida al usuario
            using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromMilliseconds(1500));
            var resp = await _http.GetAsync("", cts.Token);
            UpdateServerTimeOffset(resp);
            return (true, string.Empty);
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    public async Task<string> LoginAsync(string username, string password)
    {
        var payload = new LoginRequestDto { Username = username, Password = password };
        var json = JsonSerializer.Serialize(payload, _jsonOpts);

        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        var resp = await _http.PostAsync("api/v1/auth/login", content);
        UpdateServerTimeOffset(resp);
        var body = await resp.Content.ReadAsStringAsync();

        if (!resp.IsSuccessStatusCode)
            throw new Exception($"Login falló ({(int)resp.StatusCode}): {body}");

        var token = JsonSerializer.Deserialize<TokenResponseDto>(body, _jsonOpts);
        if (token == null || string.IsNullOrWhiteSpace(token.AccessToken))
            throw new Exception("Login falló: respuesta inválida.");

        return token.AccessToken;
    }

    public async Task<CajeroDto[]> GetCajerosAsync()
    {
        ApplyAuth();

        var resp = await _http.GetAsync("api/v1/usuarios/cajeros");
        UpdateServerTimeOffset(resp);
        var body = await resp.Content.ReadAsStringAsync();

        if (!resp.IsSuccessStatusCode)
            throw new Exception($"No se pudo cargar cajeros ({(int)resp.StatusCode}): {body}");

        return JsonSerializer.Deserialize<CajeroDto[]>(body, _jsonOpts) ?? Array.Empty<CajeroDto>();
    }

    public async Task<CajaDto[]> GetCajasAsync()
    {
        ApplyAuth();

        var resp = await _http.GetAsync("api/v1/cajas");
        UpdateServerTimeOffset(resp);
        var body = await resp.Content.ReadAsStringAsync();

        if (!resp.IsSuccessStatusCode)
            throw new Exception($"No se pudo cargar cajas ({(int)resp.StatusCode}): {body}");

        return JsonSerializer.Deserialize<CajaDto[]>(body, _jsonOpts) ?? Array.Empty<CajaDto>();
    }

    public async Task AsignarConfiguracionAsync(string cajaIdNueva, string cajeroIdNuevo, string cajaIdAnterior = null, string cajeroIdAnterior = null, string estadoOperativo = null)
    {
        ApplyAuth();

        var payload = new
        {
            caja_id_nueva = cajaIdNueva,
            cajero_id_nuevo = cajeroIdNuevo,
            caja_id_anterior = string.IsNullOrWhiteSpace(cajaIdAnterior) ? null : cajaIdAnterior,
            cajero_id_anterior = string.IsNullOrWhiteSpace(cajeroIdAnterior) ? null : cajeroIdAnterior,
            estado_operativo = estadoOperativo
        };

        var json = JsonSerializer.Serialize(payload, _jsonOpts);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        var resp = await _http.PostAsync("api/v1/asignar_configuracion", content);
        UpdateServerTimeOffset(resp);
        
        if (!resp.IsSuccessStatusCode)
        {
            var body = await resp.Content.ReadAsStringAsync();
            throw new Exception($"Error al asignar configuración ({(int)resp.StatusCode}): {body}");
        }
    }

    public async Task<IngestResponseDto> IngestAudioAsync(
    string caja,
    string cajero,
    DateTime startedAtUtc,
    DateTime endedAtUtc,
    string inputWavPath)
    {
        ApplyAuth();

        if (!File.Exists(inputWavPath))
            throw new FileNotFoundException("No existe audio a enviar", inputWavPath);

        using var form = new MultipartFormDataContent();

        form.Add(new StringContent(caja), "caja");
        form.Add(new StringContent(cajero), "cajero");
        form.Add(new StringContent(startedAtUtc.ToString("o")), "started_at");
        form.Add(new StringContent(endedAtUtc.ToString("o")), "ended_at");

        await using var fs = File.OpenRead(inputWavPath);
        var fileContent = new StreamContent(fs);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");

        form.Add(fileContent, "audio", Path.GetFileName(inputWavPath));

        var resp = await _http.PostAsync("api/v1/audio/ingest", form);
        UpdateServerTimeOffset(resp);
        var body = await resp.Content.ReadAsStringAsync();

        if (!resp.IsSuccessStatusCode)
            throw new Exception($"Ingest falló ({(int)resp.StatusCode}): {body}");

        var dto = JsonSerializer.Deserialize<IngestResponseDto>(body, _jsonOpts);
        if (dto == null || string.IsNullOrWhiteSpace(dto.GrabacionId))
            throw new Exception("Ingest falló: respuesta inválida.");

        return dto;
    }

    public async Task<string> DownloadEnhancedAsync(string grabacionId, string outputEnhancedWavPath)
    {
        ApplyAuth();

        var resp = await _http.GetAsync($"api/v1/audio/{grabacionId}/enhanced");
        if (!resp.IsSuccessStatusCode)
        {
            var bodyErr = await resp.Content.ReadAsStringAsync();
            throw new Exception($"Download enhanced falló ({(int)resp.StatusCode}): {bodyErr}");
        }

        var bytes = await resp.Content.ReadAsByteArrayAsync();
        Directory.CreateDirectory(Path.GetDirectoryName(outputEnhancedWavPath)!);
        await File.WriteAllBytesAsync(outputEnhancedWavPath, bytes);

        return outputEnhancedWavPath;
    }

    public async Task<string> GetStatusAsync(string grabacionId)
    {
        ApplyAuth();
        var resp = await _http.GetAsync($"api/v1/audio/{grabacionId}/status");
        var body = await resp.Content.ReadAsStringAsync();

        if (!resp.IsSuccessStatusCode)
            throw new Exception($"Status falló ({(int)resp.StatusCode}): {body}");

        return body; // si quieres, lo parseamos a DTO, pero para debug es suficiente
    }

    public async Task<PingResult> PingAsync(string cajaId, bool isRecording, string estadoGrabacion)
    {
        ApplyAuth();
        
        var payload = new { is_recording = isRecording, estado_grabacion = estadoGrabacion };
        var json = JsonSerializer.Serialize(payload, _jsonOpts);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        var resp = await _http.PostAsync($"api/v1/cajas/{cajaId}/ping", content);
        var body = await resp.Content.ReadAsStringAsync();
        
        if (!resp.IsSuccessStatusCode)
        {
            throw new Exception($"Ping falló ({(int)resp.StatusCode}): {body}");
        }

        UpdateServerTimeOffset(resp);

        using var doc = JsonDocument.Parse(body);
        var res = new PingResult();
        
        if (doc.RootElement.TryGetProperty("estado_operativo", out var estProp))
            res.EstadoOperativo = estProp.GetString();
        if (doc.RootElement.TryGetProperty("contacto_id", out var conProp))
            res.ContactoId = conProp.GetString() ?? "";
        if (doc.RootElement.TryGetProperty("estado_grabacion", out var grabProp))
            res.EstadoGrabacion = grabProp.GetString() ?? "apagado";
        if (doc.RootElement.TryGetProperty("cajero_nombre", out var cajProp))
            res.CajeroNombre = cajProp.GetString() ?? "SIN_ASIGNAR";
        if (doc.RootElement.TryGetProperty("turno_manana_inicio", out var tmInicioProp))
            res.TurnoMananaInicio = tmInicioProp.GetString() ?? "07:30:00";
        if (doc.RootElement.TryGetProperty("turno_manana_fin", out var tmFinProp))
            res.TurnoMananaFin = tmFinProp.GetString() ?? "12:00:00";
        if (doc.RootElement.TryGetProperty("turno_tarde_inicio", out var ttInicioProp))
            res.TurnoTardeInicio = ttInicioProp.GetString() ?? "16:00:00";
        if (doc.RootElement.TryGetProperty("turno_tarde_fin", out var ttFinProp))
            res.TurnoTardeFin = ttFinProp.GetString() ?? "19:00:00";
        if (doc.RootElement.TryGetProperty("grabacion_habilitada", out var habProp))
            res.GrabacionHabilitada = habProp.GetBoolean();
        if (doc.RootElement.TryGetProperty("en_pausa", out var pausaProp))
            res.EnPausa = pausaProp.GetBoolean();

        return res;
    }
}

public class PingResult
{
    public string EstadoOperativo { get; set; } = "Operativa";
    public string ContactoId { get; set; } = "";
    public string EstadoGrabacion { get; set; } = "apagado";
    public string CajeroNombre { get; set; } = "SIN_ASIGNAR";
    public string TurnoMananaInicio { get; set; } = "07:30:00";
    public string TurnoMananaFin { get; set; } = "12:00:00";
    public string TurnoTardeInicio { get; set; } = "16:00:00";
    public string TurnoTardeFin { get; set; } = "19:00:00";
    public bool GrabacionHabilitada { get; set; } = true;
    public bool EnPausa { get; set; } = false;
}
