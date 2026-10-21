import React, { useState, useEffect } from 'react';
import { getSucursales, createSucursal, updateSucursal, deleteSucursal } from '../../api/sucursales';

export default function SucursalesManager() {
    const [sucursales, setSucursales] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [currentSucursal, setCurrentSucursal] = useState(null);
    const [formData, setFormData] = useState({ nombre: '', direccion: '', activa: true });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const data = await getSucursales();
            setSucursales(data);
        } catch (e) {
            console.error(e);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            if (currentSucursal) {
                await updateSucursal(currentSucursal.id, formData);
            } else {
                await createSucursal(formData);
            }
            setShowModal(false);
            loadData();
        } catch (err) {
            alert("Error al guardar sucursal: " + err.message);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Seguro que deseas eliminar esta sucursal?")) return;
        try {
            await deleteSucursal(id);
            loadData();
        } catch (err) {
            alert("Error al eliminar (puede tener cajas/contactos asociados).");
        }
    };

    return (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.25rem 0', letterSpacing: '-0.02em' }}>Sucursales</h2>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                        <span style={{ fontWeight: '700', color: '#ea580c' }}>{sucursales.length}</span> sucursales registradas
                    </p>
                </div>
                <button
                    onClick={() => { setFormData({ nombre: '', direccion: '', activa: true }); setCurrentSucursal(null); setShowModal(true); }}
                    style={{
                        padding: '0.65rem 1.25rem', cursor: 'pointer', border: 'none',
                        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                        color: 'white', borderRadius: '10px', fontWeight: '700', fontSize: '0.9rem',
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        boxShadow: '0 4px 12px rgba(249,115,22,0.35)', transition: 'all 0.2s'
                    }}
                >
                    + Nueva Sucursal
                </button>
            </div>

            <div className="recordings-list-container" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: 'white' }}>
                <div className="recordings-list-header" style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 2fr) minmax(200px, 2fr) 150px', gap: '1rem', padding: '1rem 1.5rem', background: '#fff7ed', borderBottom: '1px solid #fed7aa', color: '#c2410c', fontWeight: '600', fontSize: '0.9rem' }}>
                    <div>Nombre</div>
                    <div>Dirección</div>
                    <div style={{ textAlign: 'right' }}>Acciones</div>
                </div>
                <div className="recordings-list-body" style={{ display: 'flex', flexDirection: 'column' }}>
                    {sucursales.map((s) => (
                        <div key={s.id} className="recording-row hover-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 2fr) minmax(200px, 2fr) 150px', gap: '1rem', padding: '1rem 1.5rem', borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #f97316, #fb923c)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '1.1rem', flexShrink: 0 }}>
                                    {s.nombre.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '1rem', color: '#0f172a', fontWeight: '700' }}>{s.nombre}</span>
                                    <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.6rem', borderRadius: '999px', background: s.activa ? '#dcfce7' : '#fef2f2', color: s.activa ? '#15803d' : '#991b1b', fontWeight: '600', border: s.activa ? '1px solid #bbf7d0' : '1px solid #fecaca', alignSelf: 'flex-start', marginTop: '4px' }}>
                                        {s.activa ? 'Activa' : 'Inactiva'}
                                    </span>
                                </div>
                            </div>
                            <div style={{ color: '#475569', fontSize: '0.85rem' }}>{s.direccion || 'Sin dirección'}</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                <button onClick={() => { setCurrentSucursal(s); setFormData({ nombre: s.nombre, direccion: s.direccion || '', activa: s.activa }); setShowModal(true); }} style={{ padding: '0.4rem 0.75rem', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>Editar</button>
                                <button onClick={() => handleDelete(s.id)} style={{ padding: '0.4rem 0.6rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', borderRadius: '6px', cursor: 'pointer' }}>Eliminar</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {showModal && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', animation: 'fadeIn 0.2s ease-out' }}>
                    <div className="modal-content" style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#0f172a' }}>{currentSucursal ? 'Editar Sucursal' : 'Nueva Sucursal'}</h3>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#94a3b8', cursor: 'pointer' }}>&times;</button>
                        </div>
                        <form onSubmit={handleSave} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#334155', marginBottom: '0.5rem' }}>Nombre *</label>
                                <input type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} required style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#334155', marginBottom: '0.5rem' }}>Dirección</label>
                                <input type="text" value={formData.direccion} onChange={e => setFormData({...formData, direccion: e.target.value})} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input type="checkbox" checked={formData.activa} onChange={e => setFormData({...formData, activa: e.target.checked})} id="sucursal_activa" />
                                <label htmlFor="sucursal_activa" style={{ fontSize: '0.875rem', fontWeight: '600', color: '#334155' }}>Sucursal Activa</label>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '0.6rem 1.2rem', background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px' }}>Cancelar</button>
                                <button type="submit" style={{ padding: '0.6rem 1.2rem', background: '#ea580c', color: 'white', border: 'none', borderRadius: '8px' }}>Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
