using System;
using System.Windows;
using System.Windows.Input;
using CajaRecorderAgent.Services;

namespace CajaRecorderAgent.Views;

public partial class LoginWindow : Window
{
    public bool IsAuthenticated { get; private set; }

    private AuthService? _auth;
    private readonly SettingsService _settingsService = new();

    public LoginWindow()
    {
        InitializeComponent();
        BtnOkEnabled(true);

        var settings = _settingsService.Load();
        TxtApiUrl.Text = settings.ApiBaseUrl;
        TxtUser.Text = settings.SavedUser;
        TxtPass.Password = settings.SavedPassword;

        if (string.IsNullOrWhiteSpace(settings.SavedUser))
        {
            TxtUser.Focus();
        }
        else
        {
            TxtPass.Focus();
        }
    }

    private async void Ok_Click(object sender, RoutedEventArgs e)
    {
        // Validación básica
        var user = TxtUser.Text.Trim();
        var pass = TxtPass.Password;
        var apiUrl = TxtApiUrl.Text.Trim();

        if (string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(pass) || string.IsNullOrWhiteSpace(apiUrl))
        {
            MessageBox.Show("Ingrese usuario, contraseña y la URL del servidor.", "Validación",
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        // Guardar la URL antes de validar
        var settings = _settingsService.Load();
        if (settings.ApiBaseUrl != apiUrl)
        {
            settings.ApiBaseUrl = apiUrl;
            _settingsService.Save(settings);
        }

        // Inicializar AuthService después de asegurar que la URL está guardada
        _auth = new AuthService();

        BtnOkEnabled(false);
        SetStatus("Validando credenciales...", visible: true);

        try
        {
            var result = await _auth.ValidateAsync(user, pass);

            if (result.IsSuccess)
            {
                var settingsLatest = _settingsService.Load();
                settingsLatest.SavedUser = user;
                settingsLatest.SavedPassword = pass;
                _settingsService.Save(settingsLatest);

                IsAuthenticated = true;
                DialogResult = true;
                Close();
                return;
            }

            BtnOkEnabled(true);
            SetStatus("", visible: false);
            MessageBox.Show(result.ErrorMessage, "Error de Inicio de Sesión",
                MessageBoxButton.OK, MessageBoxImage.Warning);
        }
        catch (Exception ex)
        {
            BtnOkEnabled(true);
            SetStatus("", visible: false);

            MessageBox.Show(
                "No se pudo conectar o ocurrió un error al validar.\n\n" + ex.Message,
                "Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error
            );
        }
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        IsAuthenticated = false;
        DialogResult = false;
        Close();
    }

    // Enter en PasswordBox o en URL
    private void TxtPass_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            Ok_Click(sender, e);
        }
    }

    private void BtnOkEnabled(bool enabled)
    {
        BtnLogin.IsEnabled = enabled;
        BtnCancel.IsEnabled = enabled;

        BtnLogin.Content = enabled ? "Iniciar sesión" : "Validando...";
    }

    private void SetStatus(string text, bool visible)
    {
        TxtStatus.Text = text;
        TxtStatus.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
    }
}
