using System;
using System.Windows;
using System.Windows.Threading;

namespace CajaRecorderAgent.Views
{
    public partial class SuccessWindow : Window
    {
        private DispatcherTimer _timer;

        public SuccessWindow()
        {
            InitializeComponent();
            
            // Posicionar en la esquina inferior derecha
            this.Loaded += (s, e) =>
            {
                var desktopWorkingArea = SystemParameters.WorkArea;
                this.Left = desktopWorkingArea.Right - this.Width - 20;
                this.Top = desktopWorkingArea.Bottom - this.Height - 20;
            };

            // Auto cerrar después de 2.5 segundos
            _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2.5) };
            _timer.Tick += (s, e) =>
            {
                _timer.Stop();
                this.Close();
            };
            _timer.Start();
        }
    }
}
