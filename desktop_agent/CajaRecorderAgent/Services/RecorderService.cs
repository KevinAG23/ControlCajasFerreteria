using NAudio.Wave;
using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace CajaRecorderAgent.Services;

public enum RecorderState { Stopped, Recording, Paused, Error }

public class RecorderService
{
    private WaveInEvent? _waveIn;
    private WaveFileWriter? _writer;

    private readonly object _sync = new();
    private TaskCompletionSource<bool>? _stopTcs;

    public RecorderState State { get; private set; } = RecorderState.Stopped;
    public event Action<RecorderState>? OnStateChanged;

    // NUEVO: archivo y tiempos del segmento
    public string? CurrentFilePath { get; private set; }
    public DateTime? SegmentStartedAt { get; private set; }

    // NUEVO: evento cuando se cierra un segmento
    public event Action<string, DateTime, DateTime>? OnSegmentClosed;

    public void StartRecording(int deviceNumber, string outputFile)
    {
        lock (_sync)
        {
            if (State == RecorderState.Recording) return;

            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(outputFile)!);

                CurrentFilePath = outputFile;
                SegmentStartedAt = DateTime.UtcNow;

                _waveIn = new WaveInEvent
                {
                    DeviceNumber = deviceNumber,
                    WaveFormat = new WaveFormat(16000, 1),
                    BufferMilliseconds = 200
                };

                _writer = new WaveFileWriter(outputFile, _waveIn.WaveFormat);

                _waveIn.DataAvailable += OnDataAvailable;
                _waveIn.RecordingStopped += OnRecordingStopped;

                State = RecorderState.Recording;
                OnStateChanged?.Invoke(State);

                LogService.Info($"StartRecording: device={deviceNumber}, file={outputFile}");
                _waveIn.StartRecording();
            }
            catch (Exception ex)
            {
                LogService.Error("StartRecording failed", ex);
                CleanupInternal();
                State = RecorderState.Error;
                OnStateChanged?.Invoke(State);
            }
        }
    }

    private void OnDataAvailable(object? s, WaveInEventArgs a)
    {
        try
        {
            lock (_sync)
            {
                if (State != RecorderState.Recording) return;
                if (_writer == null) return;

                _writer.Write(a.Buffer, 0, a.BytesRecorded);
                // ATENCIÓN: NUNCA hacer _writer.Flush() aquí adentro. 
                // Hacer Flush a disco 5 veces por segundo bloquea el hilo de NAudio y causa micro-cortes de milisegundos en el audio.
            }
        }
        catch (Exception ex)
        {
            LogService.Error("Write audio failed", ex);
            _ = StopAsync();
            lock (_sync)
            {
                State = RecorderState.Error;
                OnStateChanged?.Invoke(State);
            }
        }
    }

    private void OnRecordingStopped(object? s, StoppedEventArgs a)
    {
        string? closedFile;
        DateTime? startedAt;

        lock (_sync)
        {
            try
            {
                if (a.Exception != null)
                    LogService.Error("RecordingStopped with exception", a.Exception);
            }
            catch { }

            closedFile = CurrentFilePath;
            startedAt = SegmentStartedAt;

            CleanupInternal();

            if (State != RecorderState.Paused && State != RecorderState.Error)
                State = RecorderState.Stopped;

            OnStateChanged?.Invoke(State);

            _stopTcs?.TrySetResult(true);
            _stopTcs = null;

            LogService.Info($"RecordingStopped -> State={State}");
        }

        // Disparar evento fuera del lock
        if (!string.IsNullOrWhiteSpace(closedFile) && startedAt.HasValue)
        {
            var endedAt = DateTime.UtcNow;
            OnSegmentClosed?.Invoke(closedFile, startedAt.Value, endedAt);
        }
    }

    public async Task PauseAsync()
    {
        lock (_sync)
        {
            if (State != RecorderState.Recording) return;
            State = RecorderState.Paused;
            OnStateChanged?.Invoke(State);
            LogService.Info("PauseAsync requested (real stop).");
        }

        await StopAsync().ConfigureAwait(false);
    }

    public void Resume()
    {
        lock (_sync)
        {
            if (State != RecorderState.Paused) return;
            State = RecorderState.Recording;
            OnStateChanged?.Invoke(State);
            LogService.Warn("Resume() called, but recommended flow is StartRecording with a new file.");
        }
    }

    public async Task StopAsync()
    {
        TaskCompletionSource<bool>? tcsToAwait = null;
        WaveInEvent? waveToStop = null;

        lock (_sync)
        {
            if (_waveIn == null)
            {
                if (State != RecorderState.Paused && State != RecorderState.Error)
                    State = RecorderState.Stopped;

                OnStateChanged?.Invoke(State);
                return;
            }

            if (_stopTcs != null)
            {
                tcsToAwait = _stopTcs;
            }
            else
            {
                _stopTcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                tcsToAwait = _stopTcs;
                waveToStop = _waveIn;
            }
        }

        // Llamar a StopRecording FUERA del lock y en un Hilo secundario para evitar Deadlock con OnRecordingStopped
        if (waveToStop != null)
        {
            try
            {
                LogService.Info("StopAsync -> StopRecording() (Background thread)");
                _ = Task.Run(() => waveToStop.StopRecording());
            }
            catch (Exception ex)
            {
                LogService.Error("StopRecording threw exception", ex);
                lock (_sync)
                {
                    CleanupInternal();
                    if (State != RecorderState.Paused && State != RecorderState.Error)
                        State = RecorderState.Stopped;
                    OnStateChanged?.Invoke(State);
                    _stopTcs?.TrySetResult(true);
                    _stopTcs = null;
                }
                return;
            }
        }

        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await tcsToAwait!.Task.WaitAsync(cts.Token).ConfigureAwait(false);
        }
        catch
        {
            LogService.Warn("StopAsync timed out waiting RecordingStopped. Forcing cleanup.");
            lock (_sync)
            {
                CleanupInternal();
                if (State != RecorderState.Paused && State != RecorderState.Error)
                    State = RecorderState.Stopped;
                OnStateChanged?.Invoke(State);
                _stopTcs?.TrySetResult(true);
                _stopTcs = null;
            }
        }
    }

    public void Stop() => _ = StopAsync();

    private void CleanupInternal()
    {
        try
        {
            if (_waveIn != null)
            {
                _waveIn.DataAvailable -= OnDataAvailable;
                _waveIn.RecordingStopped -= OnRecordingStopped;
            }
        }
        catch { }

        try { _writer?.Dispose(); } catch { }
        try { _waveIn?.Dispose(); } catch { }

        _writer = null;
        _waveIn = null;
    }
}
