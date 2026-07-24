using CajaRecorderAgent.Models;
using System;
using System.IO;
using System.Text.Json;

namespace CajaRecorderAgent.Services;

public class SettingsService
{
    private readonly string _configPath;

    public SettingsService()
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CajaRecorderAgent");

        Directory.CreateDirectory(dir);
        _configPath = Path.Combine(dir, "settings.json");
    }

    public AppSettings Load()
    {
        try
        {
            if (!File.Exists(_configPath))
                return new AppSettings();

            // Lectura robusta: si está siendo escrito, reintenta una vez
            var json = SafeReadAllText(_configPath);
            var settings = JsonSerializer.Deserialize<AppSettings>(json);

            return settings ?? new AppSettings();
        }
        catch (Exception ex)
        {
            LogService.Error("SettingsService.Load failed, returning defaults.", ex);
            return new AppSettings();
        }
    }

    public void Save(AppSettings settings)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);

            var json = JsonSerializer.Serialize(
                settings,
                new JsonSerializerOptions { WriteIndented = true });

            // Escritura segura: escribir temporal y reemplazar
            var tmp = _configPath + ".tmp";
            File.WriteAllText(tmp, json);

            if (File.Exists(_configPath))
                File.Replace(tmp, _configPath, null);
            else
                File.Move(tmp, _configPath);

            LogService.Info("Settings saved.");
        }
        catch (Exception ex)
        {
            LogService.Error("SettingsService.Save failed.", ex);
        }
    }

    private static string SafeReadAllText(string path)
    {
        // Intento 1
        try
        {
            return File.ReadAllText(path);
        }
        catch
        {
            // Intento 2 (muy corto)
            System.Threading.Thread.Sleep(50);
            return File.ReadAllText(path);
        }
    }
}
