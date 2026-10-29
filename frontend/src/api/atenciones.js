import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';
const NEW_API_URL = import.meta.env.VITE_NEW_API_URL || 'http://localhost:8000/api/v1';

const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const getAtencionesByCajero = async (cajeroId, limit = null) => {
    try {
        const params = new URLSearchParams();
        if (limit) params.append("limit", limit);
        const queryString = params.toString() ? `?${params.toString()}` : "";
        const response = await axios.get(`${NEW_API_URL}/usuarios/${cajeroId}/atenciones${queryString}`, {
            headers: getAuthHeaders()
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching atenciones by cajero:', error);
        throw error;
    }
};

export const getAnalisisByAtencion = async (atencionId) => {
    try {
        const response = await axios.get(`${NEW_API_URL}/atenciones/${atencionId}/analisis`, {
            headers: getAuthHeaders()
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching analisis for atencion:', error);
        throw error;
    }
};
