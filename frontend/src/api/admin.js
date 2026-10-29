import axios from 'axios';
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

export async function getCostReport() {
  const token = localStorage.getItem('token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const res = await fetch(`${API_URL}/admin/cost-report`, { headers });

  if (!res.ok) {
    throw new Error("Error al obtener reporte de costos");
  }

  return await res.json();
}

// Sucursales
export const getSucursales = async (skip = 0, limit = 100) => {
  const token = localStorage.getItem('token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const response = await axios.get(`${API_URL}/sucursales?skip=${skip}&limit=${limit}`, { headers });
  return response.data;
};
export const createSucursal = async (data) => {
  const token = localStorage.getItem('token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const response = await axios.post(`${API_URL}/sucursales`, data, { headers });
  return response.data;
};
export const updateSucursal = async (id, data) => {
  const token = localStorage.getItem('token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const response = await axios.put(`${API_URL}/sucursales/${id}`, data, { headers });
  return response.data;
};
export const deleteSucursal = async (id) => {
  const token = localStorage.getItem('token');
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const response = await axios.delete(`${API_URL}/sucursales/${id}`, { headers });
  return response.data;
};

