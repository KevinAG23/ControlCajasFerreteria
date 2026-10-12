// src/api/metrics.js
import axios from 'axios';
import { getToken } from './auth';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

const getAuthHeaders = () => {
    const token = getToken() || localStorage.getItem('token');
    return {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
};

export async function getCategories() {
    const res = await axios.get(`${API_URL}/metricas/categorias`, getAuthHeaders());
    return res.data;
}

export async function getQuestions() {
    const res = await axios.get(`${API_URL}/metricas/preguntas`, getAuthHeaders());
    return res.data;
}

export async function createCategory(data) {
    try {
        const res = await axios.post(`${API_URL}/metricas/categorias`, data, getAuthHeaders());
        return res.data;
    } catch (err) {
        throw new Error(err.response?.data?.detail || err.message || 'Error al crear categoría');
    }
}

export async function updateCategory(id, data) {
    try {
        const res = await axios.put(`${API_URL}/metricas/categorias/${id}`, data, getAuthHeaders());
        return res.data;
    } catch (err) {
        throw new Error(err.response?.data?.detail || err.message || 'Error al actualizar categoría');
    }
}

export async function deleteCategory(id) {
    try {
        await axios.delete(`${API_URL}/metricas/categorias/${id}`, getAuthHeaders());
        return true;
    } catch (err) {
        throw new Error(err.response?.data?.detail || err.message || 'Error al eliminar categoría');
    }
}

export async function createQuestion(data) {
    try {
        const res = await axios.post(`${API_URL}/metricas/preguntas`, data, getAuthHeaders());
        return res.data;
    } catch (err) {
        throw new Error(err.response?.data?.detail || err.message || 'Error al crear pregunta');
    }
}

export async function updateQuestion(id, data) {
    try {
        const res = await axios.put(`${API_URL}/metricas/preguntas/${id}`, data, getAuthHeaders());
        return res.data;
    } catch (err) {
        throw new Error(err.response?.data?.detail || err.message || 'Error al actualizar pregunta');
    }
}

export async function toggleQuestionActive(id, activo) {
    try {
        const res = await axios.put(`${API_URL}/metricas/preguntas/${id}`, { activo }, getAuthHeaders());
        return res.data;
    } catch (err) {
        throw new Error(err.response?.data?.detail || err.message || 'Error al cambiar estado de la pregunta');
    }
}

export async function deleteQuestion(id) {
    try {
        await axios.delete(`${API_URL}/metricas/preguntas/${id}`, getAuthHeaders());
        return true;
    } catch (err) {
        throw new Error(err.response?.data?.detail || err.message || 'Error al eliminar pregunta');
    }
}
