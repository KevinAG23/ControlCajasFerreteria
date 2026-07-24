// src/api/metrics.js
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

const getHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
};

export async function getCategories() {
    const res = await fetch(`${API_URL}/metricas/categorias`, {
        headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch categories');
    return await res.json();
}

export async function getQuestions() {
    const res = await fetch(`${API_URL}/metricas/preguntas`, {
        headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch questions');
    return await res.json();
}

export async function createCategory(data) {
    const res = await fetch(`${API_URL}/metricas/categorias`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create category');
    }
    return await res.json();
}

export async function updateCategory(id, data) {
    const res = await fetch(`${API_URL}/metricas/categorias/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to update category');
    }
    return await res.json();
}

export async function deleteCategory(id) {
    const res = await fetch(`${API_URL}/metricas/categorias/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete category');
    return true;
}

export async function createQuestion(data) {
    const res = await fetch(`${API_URL}/metricas/preguntas`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create question');
    }
    return await res.json();
}

export async function updateQuestion(id, data) {
    const res = await fetch(`${API_URL}/metricas/preguntas/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to update question');
    }
    return await res.json();
}

export async function deleteQuestion(id) {
    const res = await fetch(`${API_URL}/metricas/preguntas/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete question');
    return true;
}
