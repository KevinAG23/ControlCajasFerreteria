// src/api/auth.js
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

export async function login(username, password) {
  const formData = new FormData();
  formData.append("username", username);
  formData.append("password", password);

  try {
    const response = await axios.post(`${API_URL}/token`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    if (response.data.access_token) {
      localStorage.setItem("token", response.data.access_token);
      localStorage.setItem("user", JSON.stringify(response.data.user));
    }

    return response.data.user;
  } catch (error) {
    console.error("Login error:", error);
    if (error.response) {
      throw new Error(error.response.data.detail || "Error al iniciar sesión");
    }
    throw new Error("Error de conexión con el servidor");
  }
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function isTokenValid() {
  const token = localStorage.getItem("token");
  if (!token) return false;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // payload.exp is in seconds, Date.now() is in milliseconds
    const isExpired = Date.now() >= payload.exp * 1000;
    if (isExpired) {
      logout();
      return false;
    }
    return true;
  } catch (e) {
    logout();
    return false;
  }
}

export function getCurrentUser() {
  if (!isTokenValid()) return null;
  const userStr = localStorage.getItem("user");
  if (userStr && userStr !== "undefined") {
    try {
      return JSON.parse(userStr);
    } catch (e) {
      console.error("Failed to parse user from localStorage", e);
      return null;
    }
  }
  return null;
}

export function getToken() {
  if (!isTokenValid()) return null;
  return localStorage.getItem("token");
}
