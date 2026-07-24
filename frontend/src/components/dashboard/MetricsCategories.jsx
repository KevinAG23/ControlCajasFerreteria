import React, { useState, useEffect } from 'react';
import { useCustomDialog } from '../common/CustomDialog';

export default function MetricsCategories() {
    const { confirm, alert } = useCustomDialog();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentCategory, setCurrentCategory] = useState({ nombre: '', descripcion: '' });
    const [isEditing, setIsEditing] = useState(false);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/metricas/categorias`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('Failed to fetch categories');
            const data = await response.json();
            setCategories(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        const isConfirmed = await confirm({
            title: '¿Estás seguro?',
            message: '¿Estás seguro de eliminar esta categoría?',
            confirmText: 'Sí, eliminar',
            cancelText: 'Cancelar'
        });
        if (!isConfirmed) return;
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/metricas/categorias/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('Failed to delete category');
            fetchCategories();
        } catch (err) {
            await alert({ type: 'error', message: err.message });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const url = isEditing
                ? `${API_URL}/metricas/categorias/${currentCategory.id}`
                : `${API_URL}/metricas/categorias`;

            const method = isEditing ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(currentCategory)
            });

            if (!response.ok) throw new Error('Failed to save category');

            setIsModalOpen(false);
            setCurrentCategory({ nombre: '', descripcion: '' });
            setIsEditing(false);
            fetchCategories();
            await alert({ type: 'success', message: 'Datos guardados correctamente' });
        } catch (err) {
            await alert({ type: 'error', message: err.message });
        }
    };

    const openModal = (category = null) => {
        if (category) {
            setCurrentCategory(category);
            setIsEditing(true);
        } else {
            setCurrentCategory({ nombre: '', descripcion: '' });
            setIsEditing(false);
        }
        setIsModalOpen(true);
    };

    return (
        <div style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: '700', color: '#111827', margin: 0 }}>Categorías de Métricas</h2>
                    <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>Administra las categorías de evaluación para el análisis de cajeros.</p>
                </div>
                <button
                    onClick={() => openModal()}
                    style={{
                        backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px',
                        border: 'none', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}
                >
                    <span>+</span> Nueva Categoría
                </button>
            </div>

            {loading ? (
                <p>Cargando...</p>
            ) : error ? (
                <p style={{ color: 'red' }}>Error: {error}</p>
            ) : (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ backgroundColor: '#f9fafb' }}>
                            <tr>
                                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.85rem', color: '#6b7280', textTransform: 'uppercase' }}>Nombre</th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.85rem', color: '#6b7280', textTransform: 'uppercase' }}>Descripción</th>
                                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.85rem', color: '#6b7280', textTransform: 'uppercase' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map((cat) => (
                                <tr key={cat.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '1rem', fontWeight: '500', color: '#111827' }}>{cat.nombre}</td>
                                    <td style={{ padding: '1rem', color: '#4b5563' }}>{cat.descripcion}</td>
                                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                                        <button
                                            onClick={() => openModal(cat)}
                                            style={{ marginRight: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}
                                            title="Editar"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            onClick={() => handleDelete(cat.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}
                                            title="Eliminar"
                                        >
                                            🗑️
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {categories.length === 0 && (
                                <tr>
                                    <td colSpan="3" style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>No hay categorías registradas.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '500px' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: '#111827' }}>
                            {isEditing ? 'Editar Categoría' : 'Nueva Categoría'}
                        </h3>
                        <form onSubmit={handleSubmit}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500', color: '#374151' }}>Nombre</label>
                                <input
                                    type="text"
                                    value={currentCategory.nombre}
                                    onChange={(e) => setCurrentCategory({ ...currentCategory, nombre: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                />
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500', color: '#374151' }}>Descripción</label>
                                <textarea
                                    value={currentCategory.descripcion}
                                    onChange={(e) => setCurrentCategory({ ...currentCategory, descripcion: e.target.value })}
                                    rows="3"
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer' }}
                                >
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
