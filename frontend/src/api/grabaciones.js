import axios from "axios";
import { getToken } from "./auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

const getAuthHeaders = () => {
    const token = getToken();
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

export const getGrabaciones = async (skip = 0, limit = null) => {
    const params = new URLSearchParams();
    if (skip) params.append("skip", skip);
    if (limit) params.append("limit", limit);
    const queryString = params.toString() ? `?${params.toString()}` : "";
    const response = await axios.get(`${API_URL}/grabaciones${queryString}`, getAuthHeaders());
    return response.data;
};

export const getGrabacion = async (id) => {
    const response = await axios.get(`${API_URL}/grabaciones/${id}`, getAuthHeaders());
    return response.data;
};

export const getGrabacionesByUsuario = async (userId, limit = null) => {
    const params = new URLSearchParams();
    if (limit) params.append("limit", limit);
    const queryString = params.toString() ? `?${params.toString()}` : "";
    const response = await axios.get(`${API_URL}/grabaciones/usuario/${userId}${queryString}`, getAuthHeaders());
    return response.data;
};

// Analysis and transcription endpoints
export const getAnalisis = async (grabacion_id) => {
    try {
        const response = await axios.get(`${API_URL}/analisis/${grabacion_id}`, getAuthHeaders());
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return null;
        }
        throw error;
    }
};

export const updateAnalisis = async (analisis_id, data) => {
    const response = await axios.put(`${API_URL}/analisis/${analisis_id}`, data, getAuthHeaders());
    return response.data;
};

export const updateRespuesta = async (respuesta_id, data) => {
    const response = await axios.put(`${API_URL}/analisis/respuestas/${respuesta_id}`, data, getAuthHeaders());
    return response.data;
};

export const getTranscripciones = async (grabacion_id) => {
    try {
        const response = await axios.get(`${API_URL}/transcripciones/${grabacion_id}`, getAuthHeaders());
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return null;
        }
        throw error;
    }
};
