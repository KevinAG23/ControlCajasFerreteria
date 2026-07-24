
import React, { useState, useEffect, useCallback } from 'react';
import {
    ChevronDown,
    ChevronRight,
    Plus,
    Trash2,
    Edit2,
    Save,
    X,
    LayoutList,
    MessageSquare
} from 'lucide-react';
import {
    getCategories,
    getQuestions,
    createCategory,
    updateCategory,
    deleteCategory,
    createQuestion,
    updateQuestion,
    deleteQuestion
} from '../../api/metrics';
import { useCustomDialog } from '../common/CustomDialog';

export default function MetricsManager() {
    const { alert, confirm } = useCustomDialog();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedCategory, setExpandedCategory] = useState(null);

    // Modal States
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [editingQuestion, setEditingQuestion] = useState(null);

    // Form States
    const [categoryForm, setCategoryForm] = useState({ nombre: '' });
    const [questionForm, setQuestionForm] = useState({ 
        texto_pregunta: '', 
        categoria_id: '', 
        peso_puntaje: 1,
        activo: true,
        tipo_respuesta: 'ESCALA_NUMERICA',
        configuracion_respuesta: '{\n  "min": 1,\n  "max": 5\n}',
        instruccion_ia: 'Evalúa en una escala numérica del 1 al 5.'
    });

    const [newOptionText, setNewOptionText] = useState('');

    const getConfigObj = () => {
        try {
            return JSON.parse(questionForm.configuracion_respuesta || '{}');
        } catch {
            return {};
        }
    };

    const updateConfigObj = (newConfig) => {
        setQuestionForm(prev => ({ ...prev, configuracion_respuesta: JSON.stringify(newConfig, null, 2) }));
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const fetchedCategories = await getCategories();
            const fetchedQuestions = await getQuestions();

            if (!Array.isArray(fetchedCategories)) {
                console.error("Categories is not an array:", fetchedCategories);
                setCategories([]);
                setLoading(false);
                return;
            }

            // Map questions into their respective categories
            const mergedCategories = fetchedCategories.map(cat => {
                return {
                    ...cat,
                    preguntas: Array.isArray(fetchedQuestions)
                        ? fetchedQuestions.filter(q => q.categoria_id === cat.id)
                        : []
                };
            });

            setCategories(mergedCategories);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching metrics data:", err);
            setError(err.message);
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const toggleCategory = (categoryId) => {
        if (expandedCategory === categoryId) {
            setExpandedCategory(null);
        } else {
            setExpandedCategory(categoryId);
        }
    };

    const handleTipoRespuestaChange = (e) => {
        const nuevoTipo = e.target.value;
        let nuevaInstruccion = questionForm.instruccion_ia;
        let nuevaConfiguracion = questionForm.configuracion_respuesta;

        if (nuevoTipo === 'BOOLEANO') {
            nuevaInstruccion = "Evalúa si se cumple o no la condición. Responde únicamente con 'true' (Sí) o 'false' (No).";
            nuevaConfiguracion = '{}';
        } else if (nuevoTipo === 'OPCION_MULTIPLE') {
            nuevaInstruccion = "Clasifica la respuesta de la transcripción en exactamente una de las siguientes opciones: Bueno, Malo, Eficiente, Ineficiente.";
            nuevaConfiguracion = '{\n  "opciones": [\n    "Bueno",\n    "Malo",\n    "Eficiente",\n    "Ineficiente"\n  ],\n  "opciones_positivas": [\n    "Bueno",\n    "Eficiente"\n  ]\n}';
        } else if (nuevoTipo === 'TEXTO_LIBRE') {
            nuevaInstruccion = "Proporciona una respuesta en formato de texto libre con tus observaciones u opiniones.";
            nuevaConfiguracion = '{\n  "maxLength": 500\n}';
        } else if (nuevoTipo === 'ESCALA_NUMERICA') {
            nuevaInstruccion = "Evalúa en una escala numérica del 1 al 5.";
            nuevaConfiguracion = '{\n  "min": 1,\n  "max": 5\n}';
        }

        setQuestionForm(prev => ({ 
            ...prev, 
            tipo_respuesta: nuevoTipo,
            instruccion_ia: nuevaInstruccion,
            configuracion_respuesta: nuevaConfiguracion
        }));
    };

    // --- CRUD OPERATIONS ---

    const handleDeleteCategory = async (id, e) => {
        e.stopPropagation();
        const isConfirmed = await confirm({
            title: '¿Estás seguro?',
            message: '¿Estás seguro de eliminar esta categoría y todas sus preguntas?',
            confirmText: 'Sí, eliminar',
            cancelText: 'Cancelar'
        });
        if (!isConfirmed) return;
        try {
            await deleteCategory(id);
            fetchData();
            await alert({ type: 'success', message: 'Categoría eliminada correctamente' });
        } catch (err) {
            await alert({ type: 'error', message: err.message });
        }
    };

    const handleDeleteQuestion = async (id) => {
        const isConfirmed = await confirm({
            title: '¿Estás seguro?',
            message: '¿Estás seguro de eliminar esta pregunta?',
            confirmText: 'Sí, eliminar',
            cancelText: 'Cancelar'
        });
        if (!isConfirmed) return;
        try {
            await deleteQuestion(id);
            fetchData();
            await alert({ type: 'success', message: 'Pregunta eliminada correctamente' });
        } catch (err) {
            await alert({ type: 'error', message: err.message });
        }
    };

    const handleSaveCategory = async (e) => {
        e.preventDefault();
        try {
            if (editingCategory) {
                await updateCategory(editingCategory.id, categoryForm);
            } else {
                await createCategory(categoryForm);
            }

            setIsCategoryModalOpen(false);
            setEditingCategory(null);
            setCategoryForm({ nombre: '' });
            fetchData();
            await alert({ type: 'success', message: 'Categoría guardada correctamente' });
        } catch (err) {
            await alert({ type: 'error', message: err.message });
        }
    };

    const handleSaveQuestion = async (e) => {
        e.preventDefault();
        try {
            const payload = { ...questionForm };
            try {
                payload.configuracion_respuesta = JSON.parse(payload.configuracion_respuesta || '{}');
            } catch (err) {
                await alert({ type: 'error', message: "La configuración de respuesta debe ser un JSON válido" });
                return;
            }

            if (editingQuestion) {
                await updateQuestion(editingQuestion.id, payload);
            } else {
                await createQuestion(payload);
            }

            setIsQuestionModalOpen(false);
            setEditingQuestion(null);
            setQuestionForm({ 
                texto_pregunta: '', 
                categoria_id: '', 
                peso_puntaje: 1,
                activo: true,
                tipo_respuesta: 'ESCALA_NUMERICA',
                configuracion_respuesta: '{\n  "min": 1,\n  "max": 5\n}',
                instruccion_ia: 'Evalúa en una escala numérica del 1 al 5.'
            });
            fetchData();
            await alert({ type: 'success', message: 'Pregunta guardada correctamente' });
        } catch (err) {
            await alert({ type: 'error', message: err.message });
        }
    };

    const openCategoryModal = (category = null, e) => {
        if (e) e.stopPropagation();
        if (category) {
            setEditingCategory(category);
            setCategoryForm({ nombre: category.nombre });
        } else {
            setEditingCategory(null);
            setCategoryForm({ nombre: '' });
        }
        setIsCategoryModalOpen(true);
    };

    const openQuestionModal = (category, question = null) => {
        setNewOptionText('');
        if (question) {
            setEditingQuestion(question);
            setQuestionForm({ 
                texto_pregunta: question.texto_pregunta, 
                categoria_id: question.categoria_id, 
                peso_puntaje: question.peso_puntaje || 1,
                activo: question.activo !== false,
                tipo_respuesta: question.tipo_respuesta || 'ESCALA_NUMERICA',
                configuracion_respuesta: question.configuracion_respuesta ? JSON.stringify(question.configuracion_respuesta, null, 2) : '{}',
                instruccion_ia: question.instruccion_ia || ''
            });
        } else {
            setEditingQuestion(null);
            setQuestionForm({ 
                texto_pregunta: '', 
                categoria_id: category.id, 
                peso_puntaje: 1,
                activo: true,
                tipo_respuesta: 'ESCALA_NUMERICA',
                configuracion_respuesta: '{\n  "min": 1,\n  "max": 5\n}',
                instruccion_ia: 'Evalúa en una escala numérica del 1 al 5.'
            });
        }
        setIsQuestionModalOpen(true);
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '2rem', fontWeight: '800', color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <LayoutList size={32} />
                        Gestión de Métricas
                    </h2>
                    <p style={{ color: '#6b7280', marginTop: '0.5rem', fontSize: '1.1rem' }}>Configura las categorías y preguntas para la evaluación de cajeros.</p>
                </div>
                <button
                    onClick={(e) => openCategoryModal(null, e)}
                    style={{
                        backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '12px',
                        border: 'none', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                        boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
                    }}
                >
                    <Plus size={20} /> Nueva Categoría
                </button>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                    <div className="loader" style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #3498db', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }}></div>
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } `}</style>
                </div>
            ) : error ? (
                <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px' }}>Error: {error}</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {categories.map((cat) => (
                        <div
                            key={cat.id}
                            style={{
                                backgroundColor: 'white', borderRadius: '16px', overflow: 'hidden',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                                border: '1px solid #f3f4f6'
                            }}
                        >
                            {/* Category Header (Accordion Trigger) */}
                            <div
                                onClick={() => toggleCategory(cat.id)}
                                style={{
                                    padding: '1.5rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    backgroundColor: expandedCategory === cat.id ? '#f8fafc' : 'white',
                                    transition: 'background-color 0.2s'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{
                                        padding: '0.5rem', borderRadius: '8px',
                                        backgroundColor: expandedCategory === cat.id ? '#dbeafe' : '#f3f4f6',
                                        color: expandedCategory === cat.id ? '#2563eb' : '#6b7280',
                                        transition: 'all 0.3s'
                                    }}>
                                        {expandedCategory === cat.id ? <ChevronDown size={24} /> : <ChevronRight size={24} />}
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '600', color: '#1f2937' }}>{cat.nombre}</h3>
                                        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                            {cat.preguntas ? cat.preguntas.length : 0} preguntas definidas
                                        </p>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={(e) => openCategoryModal(cat, e)}
                                        style={{ padding: '0.5rem', borderRadius: '8px', border: 'none', background: 'transparent', color: '#4f46e5', cursor: 'pointer' }}
                                        title="Editar Categoría"
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        onClick={(e) => handleDeleteCategory(cat.id, e)}
                                        style={{ padding: '0.5rem', borderRadius: '8px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                                        title="Eliminar Categoría"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Questions List (Accordion Content) */}
                            {expandedCategory === cat.id && (
                                <div style={{ overflow: 'hidden' }}>
                                    <div style={{ padding: '0 1.5rem 1.5rem 1.5rem', backgroundColor: '#f8fafc' }}>
                                        <div style={{ width: '100%', height: '1px', backgroundColor: '#e5e7eb', marginBottom: '1.5rem' }}></div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Preguntas de Evaluación
                                            </h4>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); openQuestionModal(cat); }}
                                                style={{
                                                    padding: '0.4rem 0.8rem', fontSize: '0.85rem', borderRadius: '6px',
                                                    border: '1px solid #d1d5db', background: 'white', color: '#374151',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '500'
                                                }}
                                            >
                                                <Plus size={16} /> Agregar Pregunta
                                            </button>
                                        </div>

                                        {cat.preguntas?.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af', backgroundColor: 'white', borderRadius: '8px', border: '1px dashed #d1d5db' }}>
                                                No hay preguntas en esta categoría.
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                {cat.preguntas.map((q) => (
                                                    <div
                                                        key={q.id}
                                                        style={{
                                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                            padding: '1rem', backgroundColor: 'white', borderRadius: '8px',
                                                            border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <MessageSquare size={18} color={q.activo !== false ? "#3b82f6" : "#9ca3af"} />
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <span style={{ color: q.activo !== false ? '#374151' : '#9ca3af', fontWeight: '500', textDecoration: q.activo === false ? 'line-through' : 'none' }}>{q.texto_pregunta}</span>
                                                                <span style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem' }}>
                                                                    Peso: <strong>{q.peso_puntaje}</strong> | Tipo: <strong>{q.tipo_respuesta || 'ESCALA_NUMERICA'}</strong>
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                            <button
                                                                onClick={() => openQuestionModal(cat, q)}
                                                                style={{ padding: '0.4rem', borderRadius: '6px', border: 'none', background: 'transparent', color: '#6b7280', cursor: 'pointer' }}
                                                                title="Editar Pregunta"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteQuestion(q.id)}
                                                                style={{ padding: '0.4rem', borderRadius: '6px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                                                                title="Eliminar Pregunta"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {categories.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '4rem', color: '#6b7280' }}>
                            <p style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>No hay categorías de métricas definidas.</p>
                            <button
                                onClick={() => openCategoryModal(null)}
                                style={{
                                    backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px',
                                    border: 'none', fontWeight: '600', cursor: 'pointer'
                                }}
                            >
                                Crear la primera categoría
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* --- MODALS --- */}

            {/* Category Modal */}
            {isCategoryModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000,
                    backdropFilter: 'blur(4px)'
                }}>
                    <div
                        style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '16px', width: '90%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
                                {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
                            </h3>
                            <button onClick={() => setIsCategoryModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={24} /></button>
                        </div>
                        <form onSubmit={handleSaveCategory}>
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>Nombre</label>
                                <input
                                    type="text"
                                    value={categoryForm.nombre}
                                    onChange={(e) => setCategoryForm({ ...categoryForm, nombre: e.target.value })}
                                    className="form-input"
                                    required
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '1rem' }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsCategoryModalOpen(false)}
                                    style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: '500', color: '#374151' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <Save size={18} /> Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Question Modal */}
            {isQuestionModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000,
                    backdropFilter: 'blur(4px)', padding: '1rem'
                }}>
                    <div
                        style={{ 
                            backgroundColor: 'white', padding: '2rem', borderRadius: '16px', 
                            width: '100%', maxWidth: '550px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            maxHeight: '90vh', overflowY: 'auto'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10, paddingBottom: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
                                {editingQuestion ? 'Editar Pregunta' : 'Nueva Pregunta'}
                            </h3>
                            <button onClick={() => setIsQuestionModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={24} /></button>
                        </div>
                        <form onSubmit={handleSaveQuestion}>
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>Pregunta</label>
                                <textarea
                                    value={questionForm.texto_pregunta}
                                    onChange={(e) => {
                                        setQuestionForm({ ...questionForm, texto_pregunta: e.target.value });
                                        e.target.style.height = 'auto';
                                        e.target.style.height = (e.target.scrollHeight) + 'px';
                                    }}
                                    required
                                    rows="1"
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '1rem', resize: 'none', overflow: 'hidden', minHeight: '45px', maxHeight: '150px', overflowY: 'auto' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>Peso/Puntaje</label>
                                    <input type="number" min="0" value={questionForm.peso_puntaje} onChange={(e) => setQuestionForm({ ...questionForm, peso_puntaje: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db' }} required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>Tipo de Respuesta</label>
                                    <select value={questionForm.tipo_respuesta} onChange={handleTipoRespuestaChange} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db' }}>
                                        <option value="ESCALA_NUMERICA">Escala Numérica</option>
                                        <option value="BOOLEANO">Booleano (Sí/No)</option>
                                        <option value="OPCION_MULTIPLE">Opción Múltiple</option>
                                        <option value="TEXTO_LIBRE">Texto Libre</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>Instrucción IA (Opcional)</label>
                                <textarea
                                    value={questionForm.instruccion_ia}
                                    onChange={(e) => {
                                        setQuestionForm({ ...questionForm, instruccion_ia: e.target.value });
                                        e.target.style.height = 'auto';
                                        e.target.style.height = (e.target.scrollHeight) + 'px';
                                    }}
                                    rows="1"
                                    placeholder="Instrucciones para la evaluación del LLM..."
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem', resize: 'none', overflow: 'hidden', minHeight: '45px', height: questionForm.tipo_respuesta === 'OPCION_MULTIPLE' ? '80px' : '60px', maxHeight: '150px', overflowY: 'auto' }}
                                />
                            </div>

                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>Configuración de Respuesta</label>
                                {(() => {
                                    const config = getConfigObj();
                                    const tipo = questionForm.tipo_respuesta;

                                    const containerStyle = {
                                        backgroundColor: '#f9fafb',
                                        padding: '1.25rem',
                                        borderRadius: '8px',
                                        border: '1px solid #e5e7eb',
                                    };

                                    const labelStyle = { display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#4b5563' };
                                    const inputStyle = { width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.95rem' };

                                    if (tipo === 'BOOLEANO') {
                                        return (
                                            <div style={containerStyle}>
                                                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'center' }}>Este tipo de respuesta no requiere configuración adicional.</p>
                                            </div>
                                        );
                                    }

                                    if (tipo === 'ESCALA_NUMERICA') {
                                        return (
                                            <div style={containerStyle}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                    <div>
                                                        <label style={labelStyle}>Valor Mínimo</label>
                                                        <input 
                                                            type="number" 
                                                            style={inputStyle} 
                                                            value={config.min !== undefined ? config.min : 1}
                                                            onChange={(e) => updateConfigObj({ ...config, min: parseInt(e.target.value) || 0 })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={labelStyle}>Valor Máximo</label>
                                                        <input 
                                                            type="number" 
                                                            style={inputStyle} 
                                                            value={config.max !== undefined ? config.max : 5}
                                                            onChange={(e) => updateConfigObj({ ...config, max: parseInt(e.target.value) || 0 })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    if (tipo === 'TEXTO_LIBRE') {
                                        return (
                                            <div style={containerStyle}>
                                                <div>
                                                    <label style={labelStyle}>Longitud Máxima (Caracteres)</label>
                                                    <input 
                                                        type="number" 
                                                        style={inputStyle} 
                                                        value={config.maxLength !== undefined ? config.maxLength : 500}
                                                        onChange={(e) => updateConfigObj({ ...config, maxLength: parseInt(e.target.value) || 0 })}
                                                        min="1"
                                                    />
                                                </div>
                                            </div>
                                        );
                                    }

                                    if (tipo === 'OPCION_MULTIPLE') {
                                        const opciones = config.opciones || [];
                                        const opciones_positivas = config.opciones_positivas || [];

                                        const handleAddOption = (e) => {
                                            if (e) e.preventDefault();
                                            if (newOptionText.trim()) {
                                                if (!opciones.includes(newOptionText.trim())) {
                                                    updateConfigObj({
                                                        ...config,
                                                        opciones: [...opciones, newOptionText.trim()]
                                                    });
                                                }
                                                setNewOptionText('');
                                            }
                                        };

                                        const handleRemoveOption = (optToRemove, e) => {
                                            e.preventDefault();
                                            updateConfigObj({
                                                ...config,
                                                opciones: opciones.filter(o => o !== optToRemove),
                                                opciones_positivas: opciones_positivas.filter(o => o !== optToRemove)
                                            });
                                        };

                                        const handleTogglePositiva = (opt) => {
                                            if (opciones_positivas.includes(opt)) {
                                                updateConfigObj({
                                                    ...config,
                                                    opciones_positivas: opciones_positivas.filter(o => o !== opt)
                                                });
                                            } else {
                                                updateConfigObj({
                                                    ...config,
                                                    opciones_positivas: [...opciones_positivas, opt]
                                                });
                                            }
                                        };

                                        return (
                                            <div style={containerStyle}>
                                                <div style={{ marginBottom: '1.25rem' }}>
                                                    <label style={labelStyle}>Agregar Nueva Opción</label>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <input 
                                                            type="text" 
                                                            style={{...inputStyle, flex: 1}} 
                                                            placeholder="Ej: Excelente, Bueno, Malo..."
                                                            value={newOptionText}
                                                            onChange={(e) => setNewOptionText(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    handleAddOption(e);
                                                                }
                                                            }}
                                                        />
                                                        <button 
                                                            onClick={handleAddOption}
                                                            type="button"
                                                            style={{ padding: '0 1rem', borderRadius: '6px', border: 'none', background: '#3b82f6', color: 'white', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                                        >
                                                            <Plus size={18} /> Agregar
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                <label style={labelStyle}>Opciones Definidas (Marca las positivas)</label>
                                                {opciones.length > 0 ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        {opciones.map(opt => (
                                                            <div key={opt} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid #d1d5db', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                    <input 
                                                                        type="checkbox" 
                                                                        checked={opciones_positivas.includes(opt)}
                                                                        onChange={() => handleTogglePositiva(opt)}
                                                                        id={`chk-${opt}`}
                                                                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                                                    />
                                                                    <label htmlFor={`chk-${opt}`} style={{ fontSize: '0.95rem', color: '#374151', cursor: 'pointer', fontWeight: '500', userSelect: 'none' }}>{opt}</label>
                                                                </div>
                                                                <button 
                                                                    onClick={(e) => handleRemoveOption(opt, e)}
                                                                    style={{ border: 'none', background: '#fee2e2', color: '#ef4444', borderRadius: '4px', padding: '0.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                                    title="Eliminar Opción"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div style={{ textAlign: 'center', fontSize: '0.9rem', color: '#9ca3af', padding: '1.5rem', border: '1px dashed #d1d5db', borderRadius: '6px', backgroundColor: 'white' }}>
                                                        No hay opciones definidas. Añade algunas arriba.
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }

                                    return null;
                                })()}
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                <input type="checkbox" id="activoCheck" checked={questionForm.activo} onChange={(e) => setQuestionForm({ ...questionForm, activo: e.target.checked })} />
                                <label htmlFor="activoCheck" style={{ fontWeight: '500', color: '#374151', cursor: 'pointer' }}>Pregunta Activa</label>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsQuestionModalOpen(false)}
                                    style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: '500', color: '#374151' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <Save size={18} /> Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
