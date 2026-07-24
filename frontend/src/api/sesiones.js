// src/api/sesiones.js
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

export async function abrirSesion(username, cajaCode) {
  const res = await fetch(`${API_URL}/sesiones/abrir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, caja_code: cajaCode }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = data?.detail || "Error al abrir sesión";
    throw new Error(msg);
  }

  return await res.json(); // SesionResponse
}

export async function cerrarSesion(username, cajaCode) {
  const res = await fetch(`${API_URL}/sesiones/cerrar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, caja_code: cajaCode }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = data?.detail || "Error al cerrar sesión";
    throw new Error(msg);
  }

  return await res.json(); // SesionResponse
}
