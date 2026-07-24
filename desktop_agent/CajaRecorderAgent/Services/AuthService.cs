using System.Threading.Tasks;
using CajaRecorderAgent.Models;

namespace CajaRecorderAgent.Services;

public class AuthService
{
    private readonly SettingsService _settingsService = new();

    public async Task<(bool IsSuccess, string ErrorMessage)> ValidateAsync(string username, string password)
    {
        AppSettings settings = _settingsService.Load();

        ApiClient api;
        try
        {
            api = new ApiClient(settings.ApiBaseUrl, settings.ApiTimeoutSeconds);
        }
        catch (System.ArgumentException argEx)
        {
            return (false, argEx.Message);
        }

        try
        {
            var token = await api.LoginAsync(username, password);
            SessionService.SetToken(token);
            return (true, string.Empty);
        }
        catch (System.Net.Http.HttpRequestException netEx)
        {
            SessionService.Clear();
            return (false, $"Error de conexión al servidor. Verifique su red y la URL (Timeout o servidor apagado).\nDetalle: {netEx.Message}");
        }
        catch (System.Threading.Tasks.TaskCanceledException timeoutEx)
        {
            SessionService.Clear();
            return (false, $"Tiempo de espera agotado al conectar con el servidor. La IP puede ser incorrecta o el puerto está cerrado.\nDetalle: {timeoutEx.Message}");
        }
        catch (System.Exception ex)
        {
            SessionService.Clear();
            return (false, ex.Message);
        }
    }
}
