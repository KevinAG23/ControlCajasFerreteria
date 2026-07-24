using System;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Win32;
using CajaRecorderAgent.Services;
using CajaRecorderAgent.Views;

namespace CajaRecorderAgent;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        this.DispatcherUnhandledException += App_DispatcherUnhandledException;

        try
        {
            EnsureAutoStart();

            this.ShutdownMode = ShutdownMode.OnExplicitShutdown;

            var indicator = new IndicatorWindow();
            var controller = new AgentController(indicator);

            // CLAVE: enlazar controller
            indicator.AttachController(controller);

            // Iniciar auto-login silencioso en segundo plano
            _ = AttemptAutoLoginAsync();

            // indicator.Show(); // Desactivado por petición: no visualizar en pantalla del escritorio
            controller.Start();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error crítico al iniciar el agente:\n{ex.Message}\n\nPor favor, contacte al soporte.",
                "Error de Inicialización", MessageBoxButton.OK, MessageBoxImage.Error);
            LogService.Error("Critical error on startup", ex);
            Shutdown();
        }
    }

    private async Task AttemptAutoLoginAsync()
    {
        try
        {
            var settingsService = new SettingsService();
            var settings = settingsService.Load();

            if (!string.IsNullOrWhiteSpace(settings.SavedUser) && 
                !string.IsNullOrWhiteSpace(settings.SavedPassword) && 
                !string.IsNullOrWhiteSpace(settings.ApiBaseUrl))
            {
                LogService.Info("Intentando auto-login silencioso...");
                var api = new ApiClient(settings.ApiBaseUrl, settings.ApiTimeoutSeconds);
                var token = await api.LoginAsync(settings.SavedUser, settings.SavedPassword);
                SessionService.SetToken(token);
                LogService.Info("Auto-login silencioso exitoso. Token asignado.");
            }
            else
            {
                LogService.Info("Auto-login cancelado: falta de credenciales o URL.");
            }
        }
        catch (Exception ex)
        {
            LogService.Warn($"Auto-login silencioso falló: {ex.Message}");
        }
    }

    private void App_DispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        LogService.Error("Unhandled UI exception", e.Exception);
        MessageBox.Show($"Ha ocurrido un error inesperado:\n{e.Exception.Message}",
            "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        e.Handled = true;
    }

    private void EnsureAutoStart()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", true);
            var exePath = Environment.ProcessPath;
            if (key != null && !string.IsNullOrEmpty(exePath))
            {
                key.SetValue("CajaRecorderAgent", exePath);
                LogService.Info("Auto-start registry key configured successfully.");
            }
            else
            {
                throw new Exception("No se pudo acceder al registro para auto-inicio.");
            }
        }
        catch (Exception ex)
        {
            LogService.Error("Error configuring auto-start", ex);
            MessageBox.Show($"Error en la configuración de instalación (Auto-Inicio):\n{ex.Message}\n\nEl agente podría no arrancar automáticamente con Windows.",
                "Error de Instalación", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }
}
