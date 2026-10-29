// src/api/metrics.js
import axios from 'axios';
import { getToken } from './auth';

const getApiUrl = () => {
    if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        if (host && host !== 'localhost' && host !== '127.0.0.1') {
            return `http://${host}:8001`;
        }
    }
    return import.meta.env.VITE_API_URL || "http://localhost:8001";
};

const getAuthHeaders = () => {
    let token = null;
    try {
        token = getToken();
    } catch (e) {
        console.warn("Could not get token from auth module:", e);
    }
    if (!token && typeof localStorage !== 'undefined') {
        token = localStorage.getItem('token');
    }
    return {
        headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json'
        }
    };
};

const formatError = (err, fallbackMsg) => {
    if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail)) {
            return detail.map(d => `${d.loc ? d.loc.slice(-1) : ''}: ${d.msg}`).join(', ');
        }
        if (typeof detail === 'object') return JSON.stringify(detail);
    }
    return err.message || fallbackMsg;
};

export async function getCategories() {
    try {
        const res = await axios.get(`${getApiUrl()}/metricas/categorias`, getAuthHeaders());
        return res.data;
    } catch (err) {
        throw new Error(formatError(err, 'Error al obtener categorías'));
    }
}

export async function getQuestions() {
    try {
        const res = await axios.get(`${getApiUrl()}/metricas/preguntas`, getAuthHeaders());
        return res.data;
    } catch (err) {
        throw new Error(formatError(err, 'Error al obtener preguntas'));
    }
}

export async function createCategory(data) {
    try {
        const res = await axios.post(`${getApiUrl()}/metricas/categorias`, data, getAuthHeaders());
        return res.data;
    } catch (err) {
        throw new Error(formatError(err, 'Error al crear categoría'));
    }
}

export async function updateCategory(id, data) {
    try {
        const res = await axios.put(`${getApiUrl()}/metricas/categorias/${id}`, data, getAuthHeaders());
        return res.data;
    } catch (err) {
        throw new Error(formatError(err, 'Error al actualizar categoría'));
    }
}

export async function toggleCategoryActive(id, activo) {
    try {
        const res = await axios.put(`${getApiUrl()}/metricas/categorias/${id}`, { activo }, getAuthHeaders());
        return res.data;
    } catch (err) {
        throw new Error(formatError(err, 'Error al cambiar estado de la categoría'));
    }
}

export async function deleteCategory(id) {
    try {
        await axios.delete(`${getApiUrl()}/metricas/categorias/${id}`, getAuthHeaders());
        return true;
    } catch (err) {
        throw new Error(formatError(err, 'Error al eliminar categoría'));
    }
}

export async function createQuestion(data) {
    try {
        const res = await axios.post(`${getApiUrl()}/metricas/preguntas`, data, getAuthHeaders());
        return res.data;
    } catch (err) {
        throw new Error(formatError(err, 'Error al crear pregunta'));
    }
}

export async function updateQuestion(id, data) {
    try {
        const res = await axios.put(`${getApiUrl()}/metricas/preguntas/${id}`, data, getAuthHeaders());
        return res.data;
    } catch (err) {
        throw new Error(formatError(err, 'Error al actualizar pregunta'));
    }
}

export async function toggleQuestionActive(id, activo) {
    try {
        const res = await axios.put(`${getApiUrl()}/metricas/preguntas/${id}`, { activo }, getAuthHeaders());
        return res.data;
    } catch (err) {
        throw new Error(formatError(err, 'Error al cambiar estado de la pregunta'));
    }
}

export async function deleteQuestion(id) {
    try {
        await axios.delete(`${getApiUrl()}/metricas/preguntas/${id}`, getAuthHeaders());
        return true;
    } catch (err) {
        throw new Error(formatError(err, 'Error al eliminar pregunta'));
    }
}
