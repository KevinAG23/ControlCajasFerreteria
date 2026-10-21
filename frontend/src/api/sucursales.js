const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

const getHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {})
  };
};

export const getSucursales = async () => {
  const res = await fetch(`${API_URL}/admin/sucursales`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Error al obtener sucursales");
  return res.json();
};

export const getSucursal = async (id) => {
  const res = await fetch(`${API_URL}/admin/sucursales/${id}`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Error al obtener sucursal");
  return res.json();
};

export const createSucursal = async (data) => {
  const res = await fetch(`${API_URL}/admin/sucursales`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("Error al crear sucursal");
  return res.json();
};

export const updateSucursal = async (id, data) => {
  const res = await fetch(`${API_URL}/admin/sucursales/${id}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("Error al actualizar sucursal");
  return res.json();
};

export const deleteSucursal = async (id) => {
  const res = await fetch(`${API_URL}/admin/sucursales/${id}`, {
    method: "DELETE",
    headers: getHeaders()
  });
  if (!res.ok) throw new Error("Error al eliminar sucursal");
  return res.json();
};
