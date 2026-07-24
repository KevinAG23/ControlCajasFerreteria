using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace CajaRecorderAgent.Services;

public static class SessionService
{
    public static string? AccessToken { get; private set; }
    public static bool IsAuthenticated => !string.IsNullOrWhiteSpace(AccessToken);

    public static void SetToken(string token) => AccessToken = token;
    public static void Clear() => AccessToken = null;
}
