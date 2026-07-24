using CajaRecorderAgent.Models;

namespace CajaRecorderAgent.Services;

public class ScheduleService
{
    public bool IsWithinSchedule(AppSettings s, DateTime now)
    {
        var t = now.TimeOfDay;

        bool inManana = InRange(t, s.TurnoMananaInicio, s.TurnoMananaFin);
        bool inTarde = InRange(t, s.TurnoTardeInicio, s.TurnoTardeFin);

        return inManana || inTarde;
    }

    private static bool InRange(TimeSpan t, TimeSpan start, TimeSpan end)
    {
        // Normal: 07:30–12:00
        if (start < end) return t >= start && t <= end;

        // Cruza medianoche: 22:00–06:00
        return t >= start || t <= end;
    }
}
