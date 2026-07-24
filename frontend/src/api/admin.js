// src/api/admin.js
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

export async function getEstadoCajas() {
  const token = localStorage.getItem('token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const res = await fetch(`${API_URL}/admin/estado-cajas`, { headers });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = data?.detail || "Error al obtener estado de cajas";
    throw new Error(msg);
  }

  // [{ codigo, tiene_sesion_abierta }]
  return await res.json();
}

export async function getLogs(page = 1, limit = 10, dateFilter = '') {
  const token = localStorage.getItem('token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const skip = (page - 1) * limit;
  let url = `${API_URL}/logs?skip=${skip}&limit=${limit}`;
  if (dateFilter) {
    url += `&date_filter=${dateFilter}`;
  }
  const res = await fetch(url, { headers });

  if (!res.ok) {
    throw new Error("Error al obtener logs");
  }

  return await res.json();
}
