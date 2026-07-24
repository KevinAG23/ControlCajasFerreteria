using System.Windows;
using CajaRecorderAgent.Services;

namespace CajaRecorderAgent.Views;

public partial class ControlWindow : Window
{
    private readonly AgentController _controller;

    public ControlWindow(AgentController controller)
    {
        InitializeComponent();
        _controller = controller;
        RefreshState();
    }

    private void RefreshState()
    {
        TxtState.Text = $"Estado: {_controller.State}";

        BtnPause.IsEnabled = _controller.State == RecorderState.Recording;
        BtnResume.IsEnabled = _controller.State == RecorderState.Paused || _controller.State == RecorderState.Stopped;
    }

    private void Pause_Click(object sender, RoutedEventArgs e)
    {
        _controller.PauseManually();
        Close(); // requisito: cerrar
    }

    private void Resume_Click(object sender, RoutedEventArgs e)
    {
        _controller.ResumeManually();
        Close(); // requisito: cerrar
    }

    private void PowerOff_Click(object sender, RoutedEventArgs e)
    {
        _controller.PowerOffManually();
        Close(); // requisito: cerrar
    }

    private void Config_Click(object sender, RoutedEventArgs e)
    {
        if (!SessionService.IsAuthenticated)
        {
            MessageBox.Show("Debe iniciar sesión.", "Acceso", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        _controller.OpenSettingsWithAuth();
        RefreshState();
    }

}
