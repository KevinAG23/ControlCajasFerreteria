import React, { useState, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, LineChart, Line
} from 'recharts';

// ─── custom tooltip ───────────────────────────────────────────────────────────
const BoxTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'white', borderRadius: '10px', padding: '0.75rem 1rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0',
        }}>
            <p style={{ margin: '0 0 0.4rem', fontWeight: '700', color: '#0f172a', fontSize: '0.82rem' }}>{label}</p>
            {payload.map(p => (
                <p key={p.dataKey} style={{ margin: '0.1rem 0', fontSize: '0.78rem', color: p.color, fontWeight: '600' }}>
                    {p.name}: {p.value}{p.dataKey === 'satisfaccion' || p.dataKey === 'uptime' ? '%' : ''}
                </p>
            ))}
        </div>
    );
};

export default function BoxDetailModal({ box, recordings = [], onClose }) {
    const [activeTab, setActiveTab] = useState('overview');

    // Filter states for History
    const [filterFecha, setFilterFecha] = useState('');
    const [filterCajero, setFilterCajero] = useState('Todos');

    const boxRecordings = useMemo(() => {
        if (!box) return [];
        return recordings.filter(r => r.caja_id === box.id);
    }, [recordings, box]);

    const cajerosDisponibles = useMemo(() => {
        const cajeros = new Set(boxRecordings.map(r => r.cajero || 'Desconocido'));
        return Array.from(cajeros).sort();
    }, [boxRecordings]);

    // Graph 1: Productivity by Cashier (Count of recordings, avg satisfaction)
    const productivityData = useMemo(() => {
        const prod = {};
        boxRecordings.forEach(r => {
            const cajero = r.cajero || 'Desconocido';
            if (!prod[cajero]) {
                prod[cajero] = { name: cajero, atenciones: 0, satisfaccion: 0, count: 0 };
            }
            prod[cajero].atenciones += 1;
            
            const calif = r.analisis?.calificacion_general;
            if (calif !== undefined && calif !== null && !isNaN(calif)) {
                prod[cajero].satisfaccion += Number(calif);
                prod[cajero].count += 1;
            }
        });
        return Object.values(prod).map(c => ({
            name: c.name,
            atenciones: c.atenciones,
            satisfaccion: c.count > 0 ? Math.round(c.satisfaccion / c.count) : 0
        }));
    }, [boxRecordings]);

    // Graph 2: Trend by Day
    const trendData = useMemo(() => {
        const trend = {};
        boxRecordings.forEach(r => {
            const dateStr = r.fecha;
            if (!trend[dateStr]) trend[dateStr] = { atenciones: 0, sumUptime: 0, count: 0 };
            trend[dateStr].atenciones += 1;
            
            const calif = r.analisis?.calificacion_general;
            if (calif !== undefined && calif !== null && !isNaN(calif)) {
                trend[dateStr].sumUptime += Number(calif);
                trend[dateStr].count += 1;
            } else {
                // Si no hay calificacion, asumimos 100% de uptime operativo si no hay reporte de falla
                trend[dateStr].sumUptime += 100;
                trend[dateStr].count += 1;
            }
        });
        const parseDate = (d) => {
            if(!d) return new Date(0);
            const p = d.split('/');
            return p.length === 3 ? new Date(p[2], p[1]-1, p[0]) : new Date(d);
        };
        const sortedDates = Object.keys(trend).sort((a, b) => parseDate(a) - parseDate(b));
        return sortedDates.map(dateStr => {
            return {
                mes: dateStr.substring(0, 5),
                atenciones: trend[dateStr].atenciones,
                uptime: trend[dateStr].count > 0 ? Math.round(trend[dateStr].sumUptime / trend[dateStr].count) : 0
            };
        }).slice(-6); // show last 6 active days
    }, [boxRecordings]);

    // Group history by Cajero and Date
    const groupedHistory = useMemo(() => {
        const groups = {};
        boxRecordings.forEach(r => {
            const cajero = r.cajero || 'Desconocido';
            const fecha = r.fecha;
            const key = `${cajero}_${fecha}`;
            
            if (!groups[key]) {
                let dateObj = null;
                if (r.timestamp) {
                    dateObj = new Date(r.timestamp);
                } else {
                    const parts = fecha.split('/');
                    if (parts.length === 3) dateObj = new Date(parts[2], parts[1]-1, parts[0]);
                    else dateObj = new Date(fecha);
                }
                
                // Formatear a YYYY-MM-DD para el filtro de input date
                let fechaIso = '';
                if(dateObj && !isNaN(dateObj)) {
                    // Ajuste de timezone
                    const d = new Date(dateObj);
                    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                    fechaIso = d.toISOString().split('T')[0];
                }

                groups[key] = {
                    id: key,
                    cajero: cajero,
                    fecha: fecha,
                    fechaIso: fechaIso,
                    rawDate: dateObj,
                    numeroGrabaciones: 0,
                    // Se asume que el usuario quiere ver el estado de la CAJA actual en esta vista
                    estadoCaja: box.estado_operativo || 'Operativa',
                    descripcionCaja: box.motivo_estado || ''
                };
            }
            groups[key].numeroGrabaciones += 1;
        });
        return Object.values(groups);
    }, [boxRecordings, box]);

    const filteredHistory = useMemo(() => {
        return groupedHistory.filter(h => {
            if (filterCajero !== 'Todos' && h.cajero !== filterCajero) return false;
            if (filterFecha && h.fechaIso !== filterFecha) return false;
            return true;
        }).sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0));
    }, [groupedHistory, filterCajero, filterFecha]);

    const tabs = [
        { id: 'overview', label: '📊 Resumen' },
        { id: 'history', label: '📋 Historial' },
    ];
    
    if (!box) return null;

    const totalCajeros = productivityData.length;
    let avgUptime = 0;
    if (productivityData.length > 0) {
        const sum = productivityData.reduce((acc, c) => acc + (c.satisfaccion || 0), 0);
        avgUptime = Math.round(sum / productivityData.length);
    }
    if (isNaN(avgUptime)) avgUptime = 0;

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.65)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1100, backdropFilter: 'blur(6px)',
            padding: '1rem',
        }} onClick={onClose}>
            <div style={{
                background: 'white', borderRadius: '22px',
                width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto',
                boxShadow: '0 32px 80px -16px rgba(15,23,42,0.35)',
                animation: 'boxModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
                display: 'flex', flexDirection: 'column',
            }} onClick={e => e.stopPropagation()}>

                <style>{`
                    @keyframes boxModalIn {
                        from { opacity:0; transform:translateY(24px) scale(0.97); }
                        to   { opacity:1; transform:translateY(0) scale(1); }
                    }
                    @keyframes statIn {
                        from { opacity:0; transform:translateY(10px); }
                        to   { opacity:1; transform:translateY(0); }
                    }
                    @keyframes rowIn {
                        from { opacity:0; transform:translateX(-8px); }
                        to   { opacity:1; transform:translateX(0); }
                    }
                    .hist-row:hover { background: #fff7ed !important; }
                    .filter-input {
                        padding: 0.5rem 0.8rem; border: 1px solid #cbd5e1; border-radius: 8px;
                        font-size: 0.85rem; color: #334155; outline: none; background: white;
                        min-width: 150px;
                    }
                    .filter-input:focus { border-color: #f97316; box-shadow: 0 0 0 2px #ffedd5; }
                `}</style>

                {/* ── HEADER ── */}
                <div style={{
                    padding: '1.75rem 2rem',
                    background: 'linear-gradient(130deg, #92400e 0%, #b45309 55%, #d97706 100%)',
                    borderRadius: '22px 22px 0 0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    position: 'relative', overflow: 'hidden',
                }}>
                    <div style={{ zIndex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                            <div style={{
                                background: 'rgba(255,255,255,0.14)', borderRadius: '12px',
                                padding: '0.5rem 0.7rem', fontSize: '1.25rem',
                                border: '1px solid rgba(255,255,255,0.18)',
                            }}>🖥️</div>
                            <h2 style={{ margin: 0, color: 'white', fontWeight: '800', fontSize: '1.5rem', letterSpacing: '-0.025em' }}>
                                {box.name || box.numero_caja || `Caja #${box.id}`}
                            </h2>
                            <span style={{
                                background: box.estado_operativo === 'Operativa' ? '#dcfce7' : box.estado_operativo === 'Mantenimiento' ? '#fef08a' : '#fee2e2', 
                                color: box.estado_operativo === 'Operativa' ? '#15803d' : box.estado_operativo === 'Mantenimiento' ? '#854d0e' : '#991b1b',
                                fontSize: '0.65rem', fontWeight: '700',
                                padding: '0.15rem 0.55rem', borderRadius: '99px',
                                letterSpacing: '0.04em', textTransform: 'uppercase',
                            }}>● {box.estado_operativo || 'Operativa'}</span>
                        </div>
                        <p style={{ margin: 0, color: '#fde68a', fontSize: '0.85rem', fontWeight: '400' }}>
                            Análisis de Productividad y Desempeño
                        </p>
                    </div>

                    <button onClick={onClose} title="Cerrar" style={{
                        zIndex: 1, background: 'rgba(255,255,255,0.12)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '10px', padding: '0.4rem 0.7rem',
                        cursor: 'pointer', color: 'white', fontSize: '1rem',
                        transition: 'all 0.15s', lineHeight: 1,
                    }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.22)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
                    >✕</button>
                </div>

                {/* ── TABS ── */}
                <div style={{
                    display: 'flex', gap: '0.25rem', padding: '0.85rem 1.75rem 0',
                    borderBottom: '1px solid #f1f5f9', background: '#fafafa',
                }}>
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                            background: activeTab === t.id ? 'white' : 'transparent',
                            border: activeTab === t.id ? '1px solid #e2e8f0' : '1px solid transparent',
                            borderBottom: activeTab === t.id ? '1px solid white' : '1px solid transparent',
                            borderRadius: '10px 10px 0 0',
                            padding: '0.5rem 1.1rem',
                            cursor: 'pointer', fontWeight: activeTab === t.id ? '700' : '500',
                            fontSize: '0.83rem',
                            color: activeTab === t.id ? '#92400e' : '#94a3b8',
                            transition: 'all 0.15s',
                            marginBottom: '-1px',
                        }}>{t.label}</button>
                    ))}
                </div>

                {/* ── CONTENT ── */}
                <div style={{ padding: '1.75rem 2rem', background: 'white', flex: 1 }}>

                    {activeTab === 'overview' && (
                        <>
                            {boxRecordings.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#64748b' }}>
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 1rem auto' }}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
                                    <h3 style={{ margin: '0 0 0.5rem', color: '#334155', fontWeight: '600' }}>Sin Grabaciones</h3>
                                    <p style={{ margin: 0, fontSize: '0.9rem' }}>Aún no existen grabaciones analizadas para generar métricas sobre esta caja.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Stat cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
                                        {[
                                            { icon: '🎙️', label: 'Total Grabaciones', value: boxRecordings.length.toString(), sub: 'Registradas en BD', bg: '#fff7ed', border: '#fed7aa', val: '#b45309', sub_c: '#92400e' },
                                            { icon: '👤', label: 'Cajeros Históricos', value: totalCajeros.toString(), sub: 'Han operado la caja', bg: '#f0f9ff', border: '#bae6fd', val: '#0369a1', sub_c: '#0284c7' },
                                            { icon: '⚡', label: 'Promedio Satisfacción', value: `${avgUptime}%`, sub: 'Rendimiento general', bg: '#f5f3ff', border: '#ddd6fe', val: '#6d28d9', sub_c: '#7c3aed' },
                                        ].map((s, i) => (
                                            <div key={s.label} style={{
                                                background: s.bg, borderRadius: '16px',
                                                border: `1px solid ${s.border}`,
                                                padding: '1.25rem 1.4rem',
                                                animation: `statIn 0.35s ease ${i * 0.07}s both`,
                                            }}>
                                                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{s.icon}</div>
                                                <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: '700', color: s.sub_c, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
                                                <p style={{ margin: '0.35rem 0 0.2rem', fontSize: '2.2rem', fontWeight: '800', color: s.val, lineHeight: 1 }}>{s.value}</p>
                                                <p style={{ margin: 0, fontSize: '0.78rem', color: s.sub_c, fontWeight: '500' }}>{s.sub}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Charts row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                                        {/* Bar chart */}
                                        <div style={{ background: '#fafafa', border: '1px solid #f1f5f9', borderRadius: '16px', padding: '1.25rem' }}>
                                            <p style={{ margin: '0 0 0.15rem', fontWeight: '700', fontSize: '0.88rem', color: '#1e293b' }}>Productividad por Cajero</p>
                                            <p style={{ margin: '0 0 1rem', fontSize: '0.72rem', color: '#94a3b8' }}>Volumen de atenciones y nivel de satisfacción</p>
                                            <div style={{ height: 180 }}>
                                                {productivityData.length > 0 ? (
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart data={productivityData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                                            <Tooltip content={<BoxTooltip />} />
                                                            <Bar dataKey="atenciones" name="Atenciones" fill="#b45309" radius={[6, 6, 0, 0]} barSize={22} />
                                                            <Bar dataKey="satisfaccion" name="Satisfacción %" fill="#fbbf24" radius={[6, 6, 0, 0]} barSize={22} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                ) : (
                                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Datos insuficientes</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Trend line chart */}
                                        <div style={{ background: '#fafafa', border: '1px solid #f1f5f9', borderRadius: '16px', padding: '1.25rem' }}>
                                            <p style={{ margin: '0 0 0.15rem', fontWeight: '700', fontSize: '0.88rem', color: '#1e293b' }}>Tendencia Diaria</p>
                                            <p style={{ margin: '0 0 1rem', fontSize: '0.72rem', color: '#94a3b8' }}>Evolución del uso a lo largo del tiempo</p>
                                            <div style={{ height: 180 }}>
                                                {trendData.length > 0 ? (
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                            <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                                            <Tooltip content={<BoxTooltip />} />
                                                            <Line type="monotone" dataKey="atenciones" name="Atenciones" stroke="#b45309" strokeWidth={2.5} dot={false} />
                                                            <Line type="monotone" dataKey="uptime" name="Promedio %" stroke="#d97706" strokeWidth={2.5} strokeDasharray="5 4" dot={false} />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                ) : (
                                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Datos insuficientes</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {activeTab === 'history' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Filters Bar */}
                            <div style={{ 
                                display: 'flex', gap: '1rem', flexWrap: 'wrap',
                                background: '#f8fafc', padding: '1.2rem', borderRadius: '12px', border: '1px solid #e2e8f0'
                            }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748b' }}>CAJERO ASIGNADO</label>
                                    <select className="filter-input" value={filterCajero} onChange={e => setFilterCajero(e.target.value)}>
                                        <option value="Todos">Todos los cajeros</option>
                                        {cajerosDisponibles.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748b' }}>FECHA</label>
                                    <input 
                                        type="date" className="filter-input"
                                        value={filterFecha} onChange={e => setFilterFecha(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                {/* Table header */}
                                <div style={{
                                    background: 'linear-gradient(130deg, #92400e 0%, #b45309 55%, #d97706 100%)',
                                    padding: '0.9rem 1.4rem',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <span style={{ color: 'white', fontWeight: '700', fontSize: '0.9rem' }}>📋 Historial de Asignaciones y Uso</span>
                                    <span style={{
                                        background: 'rgba(255,255,255,0.15)', color: 'white',
                                        borderRadius: '20px', padding: '0.18rem 0.75rem',
                                        fontSize: '0.75rem', fontWeight: '700',
                                        border: '1px solid rgba(255,255,255,0.22)',
                                    }}>{filteredHistory.length} jornadas filtradas</span>
                                </div>

                                {/* Column labels */}
                                <div style={{
                                    display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr',
                                    padding: '0.65rem 1.4rem',
                                    background: '#fafafa', borderBottom: '1px solid #f1f5f9',
                                    gap: '1rem',
                                }}>
                                    {['Cajero Asignado', 'Fecha', 'Grabaciones', 'Estado'].map(h => (
                                        <span key={h} style={{ fontSize: '0.7rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
                                    ))}
                                </div>

                                {/* Rows */}
                                <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                                    {filteredHistory.length > 0 ? filteredHistory.map((row, i) => (
                                        <div key={row.id} className="hist-row" style={{
                                            display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr',
                                            padding: '1rem 1.4rem', gap: '1rem',
                                            alignItems: 'center',
                                            borderBottom: i < filteredHistory.length - 1 ? '1px solid #f8fafc' : 'none',
                                            background: i % 2 === 0 ? 'white' : '#fafafa',
                                            transition: 'background 0.15s',
                                            animation: `rowIn 0.3s ease ${(i % 10) * 0.03}s both`,
                                        }}>
                                            <span style={{ fontWeight: '600', fontSize: '0.95rem', color: '#1e293b' }}>
                                                {row.cajero}
                                            </span>
                                            <span style={{ fontSize: '0.9rem', color: '#475569', fontWeight: '500' }}>
                                                {row.fecha}
                                            </span>
                                            <span style={{
                                                fontSize: '0.9rem', fontWeight: '700', color: '#d97706',
                                                background: '#fef3c7', padding: '0.2rem 0.6rem', borderRadius: '8px', display: 'inline-block', width: 'fit-content'
                                            }}>
                                                {row.numeroGrabaciones}
                                            </span>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{
                                                    fontSize: '0.85rem', fontWeight: '700',
                                                    color: row.estadoCaja === 'Operativa' ? '#15803d' : row.estadoCaja === 'Mantenimiento' ? '#854d0e' : '#991b1b',
                                                }}>
                                                    {row.estadoCaja}
                                                </span>
                                                {row.descripcionCaja && (
                                                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {row.descripcionCaja}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )) : (
                                        <div style={{ textAlign: 'center', padding: '3rem 2rem', color: '#94a3b8' }}>
                                            No se encontraron registros con los filtros aplicados.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
