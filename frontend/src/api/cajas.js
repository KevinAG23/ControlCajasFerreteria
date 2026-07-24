import axios from "axios";
import { getToken } from "./auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";
const NEW_API_URL = import.meta.env.VITE_NEW_API_URL || "http://localhost:8000/api/v1";

const getAuthHeaders = () => {
    const token = getToken();
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

export const getCajas = async (skip = 0, limit = 100) => {
    const response = await axios.get(`${API_URL}/cajas?skip=${skip}&limit=${limit}`, getAuthHeaders());
    return response.data;
};

export const getTodasCajas = async () => {
    // We use the admin API which returns ALL fields including contacto_id and estado_operativo
    const response = await axios.get(`${API_URL}/cajas?skip=0&limit=1000`, getAuthHeaders());
    return response.data;
};

export const createCaja = async (cajaData) => {
    const response = await axios.post(`${API_URL}/cajas`, cajaData, getAuthHeaders());
    return response.data;
};

export const updateCaja = async (id, cajaData) => {
    const response = await axios.put(`${API_URL}/cajas/${id}`, cajaData, getAuthHeaders());
    return response.data;
};

export const deleteCaja = async (id) => {
    const response = await axios.delete(`${API_URL}/cajas/${id}`, getAuthHeaders());
    return response.data;
};
