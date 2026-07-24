using System.Globalization;
using System.Linq;
using System.Windows;
using CajaRecorderAgent.Models;
using CajaRecorderAgent.Services;
using NAudio.Wave;

namespace CajaRecorderAgent.Views;

public partial class SettingsWindow : Window
{
    private readonly SettingsService _settingsService = new();
    public AppSettings Settings { get; private set; }

    private CajeroDto[] _cajeros = System.Array.Empty<CajeroDto>();
    private CajaDto[] _cajas = System.Array.Empty<CajaDto>();

    public SettingsWindow(AppSettings current)
    {
        InitializeComponent();
        Settings = current;

        LoadMics();

        Loaded += async (_, __) =>
        {
            BindLocal();              // pinta lo que tienes en settings.json
            await LoadFromApiAsync(); // trae cajeros/cajas de la BD y actualiza combos
        };
    }

    // ===================================================================
    // MICRÓFONOS
    // ===================================================================
    private void LoadMics()
    {
        CmbMic.Items.Clear();
        for (int i = 0; i < WaveInEvent.DeviceCount; i++)
        {
            var caps = WaveInEvent.GetCapabilities(i);
            CmbMic.Items.Add(new MicItem { Id = i, Name = caps.ProductName });
        }
    }

    // ===================================================================
    // BIND LOCAL (desde settings.json)
    // ===================================================================
    private void BindLocal()
    {
        // URL del servidor
        TxtApiUrl.Text = Settings.ApiBaseUrl;

        // Horarios
        TxtMananaInicio.Text = Settings.TurnoMananaInicio.ToString(@"hh\:mm");
        TxtMananaFin.Text    = Settings.TurnoMananaFin.ToString(@"hh\:mm");
        TxtTardeInicio.Text  = Settings.TurnoTardeInicio.ToString(@"hh\:mm");
        TxtTardeFin.Text     = Settings.TurnoTardeFin.ToString(@"hh\:mm");

        // Micrófono
        if (int.TryParse(Settings.MicrophoneId, out var id))
        {
            foreach (var item in CmbMic.Items)
            {
                if (item is MicItem mi && mi.Id == id) { CmbMic.SelectedItem = item; break; }
            }
        }
        else if (CmbMic.Items.Count > 0)
        {
            CmbMic.SelectedIndex = 0;
        }
    }

    // ===================================================================
    // CARGA CAJEROS/CAJAS DESDE LA API
    // ===================================================================
    private async System.Threading.Tasks.Task LoadFromApiAsync()
    {
        if (!SessionService.IsAuthenticated)
            return;

        // Usar la URL actual del TextBox (puede haber sido editada)
        var urlToUse = TxtApiUrl.Text.Trim();
        if (string.IsNullOrWhiteSpace(urlToUse))
            urlToUse = Settings.ApiBaseUrl;

        try
        {
            var api = new ApiClient(urlToUse, Settings.ApiTimeoutSeconds);

            var cajerosList = (await api.GetCajerosAsync())
                .Where(c => c.Activo)
                .OrderBy(c => c.NombreCompleto)
                .ToList();

            var cajasList = (await api.GetCajasAsync())
                .Where(c => c.Activo != false) // null o true => ok
                .OrderBy(c => c.NombreIdentificador)
                .ToList();

            // Injectar los guardados si no existen en la lista de disponibles
            if (!string.IsNullOrWhiteSpace(Settings.CajeroId) && Guid.TryParse(Settings.CajeroId, out var cajeroGuid) && !cajerosList.Any(x => x.Id == cajeroGuid))
            {
                cajerosList.Insert(0, new CajeroDto { Id = cajeroGuid, Username = Settings.Cajero, NombreCompleto = Settings.Cajero, Activo = true });
            }
            if (!string.IsNullOrWhiteSpace(Settings.CajaId) && Guid.TryParse(Settings.CajaId, out var cajaGuid) && !cajasList.Any(x => x.Id == cajaGuid))
            {
                cajasList.Insert(0, new CajaDto { Id = cajaGuid, NombreIdentificador = Settings.NumeroCaja, Activo = true });
            }

            _cajeros = cajerosList.ToArray();
            _cajas = cajasList.ToArray();

            // Poblar combos
            CmbCajero.ItemsSource    = _cajeros;
            CmbCajero.DisplayMemberPath = "NombreCompleto";

            CmbCaja.ItemsSource    = _cajas;
            CmbCaja.DisplayMemberPath = "NombreIdentificador";

            // Seleccionar los valores actuales guardados en settings.json
            var cajeroSel = _cajeros.FirstOrDefault(x =>
                string.Equals(x.Username, Settings.Cajero, System.StringComparison.OrdinalIgnoreCase) ||
                string.Equals(x.NombreCompleto, Settings.Cajero, System.StringComparison.OrdinalIgnoreCase));

            if (cajeroSel != null) CmbCajero.SelectedItem = cajeroSel;
            else if (_cajeros.Length > 0) CmbCajero.SelectedIndex = 0;

            var cajaSel = _cajas.FirstOrDefault(x =>
                string.Equals(x.NombreIdentificador, Settings.NumeroCaja, System.StringComparison.OrdinalIgnoreCase));

            if (cajaSel != null) CmbCaja.SelectedItem = cajaSel;
            else if (_cajas.Length > 0) CmbCaja.SelectedIndex = 0;

            // Seleccionar Estado Operativo
            foreach (System.Windows.Controls.ComboBoxItem item in CmbEstado.Items)
            {
                if (item.Content.ToString() == Settings.EstadoOperativo)
                {
                    CmbEstado.SelectedItem = item;
                    break;
                }
            }
            if (CmbEstado.SelectedItem == null) CmbEstado.SelectedIndex = 0;
        }
        catch (System.Exception ex)
        {
            MessageBox.Show(
                "No se pudo cargar Cajas/Cajeros desde la API.\n" +
                "Verifica la URL del servidor y que esté encendido.\n\n" + ex.Message,
                "Aviso de conexión", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    // ===================================================================
    // GUARDAR
    // ===================================================================
    private async void Save_Click(object sender, RoutedEventArgs e)
    {
        if (CmbMic.SelectedItem is not MicItem mic)
        {
            MessageBox.Show("Seleccione un micrófono.", "Validación",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (!TryParseHHmm(TxtMananaInicio.Text, out var mi) ||
            !TryParseHHmm(TxtMananaFin.Text,    out var mf) ||
            !TryParseHHmm(TxtTardeInicio.Text,  out var ti) ||
            !TryParseHHmm(TxtTardeFin.Text,     out var tf))
        {
            MessageBox.Show("Formato de hora inválido. Use HH:mm (ej: 07:30).", "Validación",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        // Validar URL del servidor
        var apiUrl = TxtApiUrl.Text.Trim();
        if (string.IsNullOrWhiteSpace(apiUrl) ||
            (!apiUrl.StartsWith("http://") && !apiUrl.StartsWith("https://")))
        {
            MessageBox.Show("URL del servidor inválida. Debe empezar con http:// o https://", "Validación",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        // Micrófono
        Settings.MicrophoneId   = mic.Id.ToString();
        Settings.MicrophoneName = mic.Name;

        // URL del servidor
        Settings.ApiBaseUrl = apiUrl;

        string newCajaId = "";
        string newCajeroId = "";

        // Caja (desde combo, o mantener el valor actual)
        if (CmbCaja.SelectedItem is CajaDto caja)
        {
            Settings.NumeroCaja = caja.NombreIdentificador;
            newCajaId = caja.Id.ToString();
        }
        else
        {
            Settings.NumeroCaja = Settings.NumeroCaja.Trim();
            newCajaId = Settings.CajaId;
        }

        // Cajero (guardamos username como clave para el API)
        if (CmbCajero.SelectedItem is CajeroDto cajero)
        {
            Settings.Cajero = cajero.Username;
            newCajeroId = cajero.Id.ToString();
        }
        else
        {
            Settings.Cajero = Settings.Cajero.Trim();
            newCajeroId = Settings.CajeroId;
        }

        if (CmbEstado.SelectedItem is System.Windows.Controls.ComboBoxItem estadoItem)
        {
            Settings.EstadoOperativo = estadoItem.Content.ToString() ?? "Operativa";
        }

        // Llamar a asignar configuracion si hubo cambios (o para forzar estado local)
        try
        {
            var api = new ApiClient(apiUrl, Settings.ApiTimeoutSeconds);
            // Solo asignar si tenemos IDs validos
            if (!string.IsNullOrWhiteSpace(newCajaId) && !string.IsNullOrWhiteSpace(newCajeroId))
            {
                // Si cambiaron los IDs, llamamos a la API para asignar los nuevos y liberar los viejos
                if (newCajaId != Settings.CajaId || newCajeroId != Settings.CajeroId)
                {
                    await api.AsignarConfiguracionAsync(newCajaId, newCajeroId, Settings.CajaId, Settings.CajeroId, Settings.EstadoOperativo);
                }
                else
                {
                    // Forzar que sigan en uso por si el backend se reinicio
                    await api.AsignarConfiguracionAsync(newCajaId, newCajeroId, null, null, Settings.EstadoOperativo);
                }
                Settings.CajaId = newCajaId;
                Settings.CajeroId = newCajeroId;
            }
        }
        catch (System.Exception ex)
        {
            MessageBox.Show($"Error al asignar la caja o cajero en el servidor:\n{ex.Message}", "Aviso de conexión", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        // Horarios
        Settings.TurnoMananaInicio = mi;
        Settings.TurnoMananaFin    = mf;
        Settings.TurnoTardeInicio  = ti;
        Settings.TurnoTardeFin     = tf;

        _settingsService.Save(Settings);

        LogService.Info($"Settings guardados: API={apiUrl}, Caja={Settings.NumeroCaja}, Cajero={Settings.Cajero}");

        DialogResult = true;
        Close();
    }

    private static bool TryParseHHmm(string input, out System.TimeSpan ts)
        => System.TimeSpan.TryParseExact(input.Trim(), @"hh\:mm", CultureInfo.InvariantCulture, out ts);

    private void Close_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }

    private class MicItem
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public override string ToString() => $"{Id} - {Name}";
    }
}
