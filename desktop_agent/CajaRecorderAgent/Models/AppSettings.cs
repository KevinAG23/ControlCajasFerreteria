using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;


namespace CajaRecorderAgent.Models;

public class AppSettings
{
    public string MicrophoneId { get; set; } = "";
    public string MicrophoneName { get; set; } = "";

    public string NumeroCaja { get; set; } = "1";
    public string CajaId { get; set; } = "";
    public string Cajero { get; set; } = "SIN_ASIGNAR";
    public string CajeroId { get; set; } = "";
    public string EstadoOperativo { get; set; } = "Operativa";

    public string SavedUser { get; set; } = "";
    public string SavedPassword { get; set; } = "";



    public TimeSpan TurnoMananaInicio { get; set; } = new(7, 30, 0);
    public TimeSpan TurnoMananaFin { get; set; } = new(12, 0, 0);
    public TimeSpan TurnoTardeInicio { get; set; } = new(16, 0, 0);
    public TimeSpan TurnoTardeFin { get; set; } = new(19, 0, 0);

    public bool GrabacionHabilitada { get; set; } = true;

    // Backend — URL del servidor de API
    public string ApiBaseUrl { get; set; } = "";
    public int ApiTimeoutSeconds { get; set; } = 30;

    public string OutputFolder { get; set; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                     "CajaRecorderAgent", "recordings");
}
