using System;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using CajaRecorderAgent.Services;
using Hardcodet.Wpf.TaskbarNotification;

namespace CajaRecorderAgent.Views;

public partial class IndicatorWindow : Window
{
    private AgentController? _controller;
    private TaskbarIcon? _taskbarIcon;

    public IndicatorWindow()
    {
        InitializeComponent();
        Loaded += (_, __) => PositionBottomLeft();
        InitializeTaskbarIcon();
        SetStopped(); // estado por defecto
        SetTransmitting(false);
        SetServerConnection(true);
    }

    private void InitializeTaskbarIcon()
    {
        try
        {
            _taskbarIcon = new TaskbarIcon();
            var iconUri = new Uri("pack://application:,,,/Assets/logo.ico");
            var iconStream = Application.GetResourceStream(iconUri)?.Stream;
            if (iconStream != null)
            {
                _taskbarIcon.Icon = new System.Drawing.Icon(iconStream);
            }
            _taskbarIcon.ToolTipText = "Caja Recorder Agent";
            
            // Double click or left click to open control panel
            _taskbarIcon.TrayLeftMouseDown += (s, e) => OpenLoginAndControl();
            _taskbarIcon.TrayMouseDoubleClick += (s, e) => OpenLoginAndControl();

            // Right click context menu
            var menu = new System.Windows.Controls.ContextMenu();
            
            var openItem = new System.Windows.Controls.MenuItem();
            openItem.Header = "Abrir Panel";
            openItem.Click += (s, e) => OpenLoginAndControl();
            menu.Items.Add(openItem);
            
            var exitItem = new System.Windows.Controls.MenuItem();
            exitItem.Header = "Salir";
            exitItem.Click += (s, e) => Application.Current.Shutdown();
            menu.Items.Add(exitItem);

            _taskbarIcon.ContextMenu = menu;
        }
        catch (Exception ex)
        {
            LogService.Error("Error al inicializar TaskbarIcon", ex);
        }
    }

    private void UpdateTaskbarTooltip(string text)
    {
        if (_taskbarIcon != null)
        {
            _taskbarIcon.ToolTipText = $"Caja Recorder: {text}";
        }
    }

    protected override void OnClosed(EventArgs e)
    {
        _taskbarIcon?.Dispose();
        base.OnClosed(e);
    }

    public void AttachController(AgentController controller)
        => _controller = controller;

    // Esquina inferior izquierda
    private void PositionBottomLeft()
    {
        var workingArea = SystemParameters.WorkArea;
        Left = workingArea.Left + 12;
        Top = workingArea.Bottom - Height - 12;
    }

    private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        => OpenLoginAndControl();

    private void RootBorder_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        => OpenLoginAndControl();

    private void OpenLoginAndControl()
    {
        if (_controller == null)
        {
            MessageBox.Show("Controller no asignado (AttachController no se ejecutó).");
            return;
        }

        // Evitar abrir múltiples diálogos de login si ya hay uno
        foreach (Window win in Application.Current.Windows)
        {
            if (win is LoginWindow || win is ControlWindow)
            {
                win.Activate();
                return;
            }
        }

        // 1) Login siempre
        var login = new LoginWindow();
        var ok = login.ShowDialog() == true && login.IsAuthenticated;
        if (!ok) return;

        // 2) Abrir panel de control
        var control = new ControlWindow(_controller);
        control.ShowDialog();
    }

    // ─── Estados ───────────────────────────────────────────────────────────────

    public void SetRecording()
    {
        Dispatcher.Invoke(() => {
            TxtPoweredOffLabel.Visibility = Visibility.Collapsed;
            StatusPanel.Visibility = Visibility.Visible;
            TxtIcon.Text = "●";
            Circle.Background = new SolidColorBrush(Color.FromRgb(245, 158, 91)); // naranja
            this.ToolTip = "Grabando...";
            UpdateTaskbarTooltip("Grabando...");
        });
    }

    public void SetPaused()
    {
        Dispatcher.Invoke(() => {
            TxtPoweredOffLabel.Visibility = Visibility.Collapsed;
            StatusPanel.Visibility = Visibility.Visible;
            TxtIcon.Text = "⏸";
            Circle.Background = new SolidColorBrush(Color.FromRgb(247, 184, 137)); // naranja suave
            this.ToolTip = "Pausado";
            UpdateTaskbarTooltip("Pausado");
        });
    }

    public void SetStopped()
    {
        Dispatcher.Invoke(() => {
            TxtPoweredOffLabel.Visibility = Visibility.Collapsed;
            StatusPanel.Visibility = Visibility.Visible;
            TxtIcon.Text = "■";
            Circle.Background = new SolidColorBrush(Color.FromRgb(200, 200, 200)); // gris claro
            this.ToolTip = "Detenido (fuera de horario)";
            UpdateTaskbarTooltip("Detenido (fuera de horario)");
        });
    }

    public void SetPoweredOff()
    {
        Dispatcher.Invoke(() => {
            // Ícono de apagado
            TxtIcon.Text = "⏻";
            Circle.Background = new SolidColorBrush(Color.FromRgb(100, 100, 100)); // gris oscuro

            // Mostrar etiqueta APAGADO debajo del ícono
            TxtPoweredOffLabel.Visibility = Visibility.Visible;

            // Ocultar líneas de servidor/transmisión
            StatusPanel.Visibility = Visibility.Collapsed;

            this.ToolTip = "Sistema apagado — Haz clic para abrir el panel";
            UpdateTaskbarTooltip("Sistema apagado");
        });
    }

    public void SetError(string message = "Error al enviar grabación al servidor.\nGuardado localmente.")
    {
        Dispatcher.Invoke(() => {
            TxtPoweredOffLabel.Visibility = Visibility.Collapsed;
            StatusPanel.Visibility = Visibility.Visible;
            TxtIcon.Text = "⚠";
            Circle.Background = new SolidColorBrush(Color.FromRgb(255, 60, 60)); // rojo
            this.ToolTip = message;
            UpdateTaskbarTooltip(message);
        });
    }

    public void SetMicError(string message)
    {
        Dispatcher.Invoke(() => {
            TxtPoweredOffLabel.Visibility = Visibility.Collapsed;
            StatusPanel.Visibility = Visibility.Visible;
            TxtIcon.Text = "🎤";
            Circle.Background = new SolidColorBrush(Color.FromRgb(220, 100, 100)); // rojo opaco
            this.ToolTip = $"Error de Micrófono:\n{message}";
            UpdateTaskbarTooltip($"Error de Micrófono: {message}");
        });
    }

    public void SetTransmitting(bool isTransmitting)
    {
        // Se deja vacío por petición del usuario: el texto de transmisión ahora depende directamente
        // de si el servidor está OK o Caído (ver SetServerConnection).
    }

    public void SetServerConnection(bool isConnected, string errorReason = "")
    {
        Dispatcher.Invoke(() => {
            if (isConnected)
            {
                TxtServerStatus.Text = "Servidor OK";
                TxtServerStatus.Foreground = new SolidColorBrush(Colors.SeaGreen);
                TxtServerStatus.ToolTip = "Conexión estable con el servidor.";

                TxtTransmission.Text = "Transmitiendo...";
                TxtTransmission.Foreground = new SolidColorBrush(Colors.DarkOrange);
            }
            else
            {
                TxtServerStatus.Text = "Servidor Caído";
                TxtServerStatus.Foreground = new SolidColorBrush(Color.FromRgb(255, 60, 60));
                TxtServerStatus.ToolTip = $"Error de conexión:\n{errorReason}";

                TxtTransmission.Text = "Sin transmisión";
                TxtTransmission.Foreground = new SolidColorBrush(Colors.Gray);

                UpdateTaskbarTooltip($"Servidor Caído - {errorReason}");
            }
        });
    }
}
