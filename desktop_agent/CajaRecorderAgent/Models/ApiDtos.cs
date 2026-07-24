using System;
using System.Text.Json.Serialization;

namespace CajaRecorderAgent.Models;

public class LoginRequestDto
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = "";

    [JsonPropertyName("password")]
    public string Password { get; set; } = "";
}

public class TokenResponseDto
{
    [JsonPropertyName("access_token")]
    public string AccessToken { get; set; } = "";

    [JsonPropertyName("token_type")]
    public string TokenType { get; set; } = "bearer";
}

public class CajeroDto
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("username")]
    public string Username { get; set; } = "";

    [JsonPropertyName("nombre_completo")]
    public string NombreCompleto { get; set; } = "";

    [JsonPropertyName("activo")]
    public bool Activo { get; set; }
}

public class CajaDto
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("nombre_identificador")]
    public string NombreIdentificador { get; set; } = "";

    [JsonPropertyName("ubicacion")]
    public string? Ubicacion { get; set; }

    [JsonPropertyName("activo")]
    public bool? Activo { get; set; }
}

public class IngestResponseDto
{
    [JsonPropertyName("grabacion_id")]
    public string GrabacionId { get; set; } = "";

    [JsonPropertyName("estado")]
    public string Estado { get; set; } = "";
}

