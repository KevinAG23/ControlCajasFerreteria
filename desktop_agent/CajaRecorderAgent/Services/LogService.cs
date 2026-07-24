using System;
using System.IO;

namespace CajaRecorderAgent.Services;

public static class LogService
{
    private static readonly object _lock = new();

    // Log en LocalAppData\CajaRecorderAgent\logs\app_yyyyMMdd.log
    public static void Info(string message) => Write("INFO", message);
    public static void Warn(string message) => Write("WARN", message);
    public static void Error(string message, Exception? ex = null)
        => Write("ERROR", ex == null ? message : $"{message} | {ex.GetType().Name}: {ex.Message}");

    private static void Write(string level, string message)
    {
        try
        {
            var baseDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "CajaRecorderAgent", "logs");

            Directory.CreateDirectory(baseDir);

            var file = Path.Combine(baseDir, $"app_{DateTime.Now:yyyyMMdd}.log");
            var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} [{level}] {message}{Environment.NewLine}";

            lock (_lock)
            {
                File.AppendAllText(file, line);
            }
        }
        catch
        {
            // Nunca dejar que el logging tumbe la app
        }
    }
}
