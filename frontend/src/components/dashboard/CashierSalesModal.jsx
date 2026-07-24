import React, { useState, useMemo } from 'react';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
    Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
    PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis,
    AreaChart, Area,
} from 'recharts';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const MONTHS = ['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Ene', 'Feb'];
const CATEGORIES = ['Tecnología', 'Oficina', 'Electrónica', 'Papelería', 'Accesorios'];

const PERF_CFG = {
    Excelente: { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7', bar: '#10b981', pie: '#10b981' },
    Bueno: { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd', bar: '#3b82f6', pie: '#3b82f6' },
    Regular: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d', bar: '#f59e0b', pie: '#f59e0b' },
    Bajo: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', bar: '#ef4444', pie: '#ef4444' },
};

const CAT_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];
const CAT_BGS = ['#d1fae5', '#dbeafe', '#ede9fe', '#fef3c7', '#fee2e2'];

// Monthly performance trend data (no money)
const MONTHLY_TREND = [
    { mes: 'Mar', unidades: 38, conversion: 72, eficiencia: 80, satisfaccion: 78 },
    { mes: 'Abr', unidades: 52, conversion: 78, eficiencia: 83, satisfaccion: 81 },
    { mes: 'May', unidades: 47, conversion: 75, eficiencia: 79, satisfaccion: 76 },
    { mes: 'Jun', unidades: 60, conversion: 80, eficiencia: 85, satisfaccion: 82 },
    { mes: 'Jul', unidades: 65, conversion: 83, eficiencia: 88, satisfaccion: 85 },
    { mes: 'Ago', unidades: 57, conversion: 79, eficiencia: 84, satisfaccion: 83 },
    { mes: 'Sep', unidades: 49, conversion: 74, eficiencia: 78, satisfaccion: 75 },
    { mes: 'Oct', unidades: 70, conversion: 85, eficiencia: 89, satisfaccion: 87 },
    { mes: 'Nov', unidades: 82, conversion: 88, eficiencia: 91, satisfaccion: 89 },
    { mes: 'Dic', unidades: 110, conversion: 92, eficiencia: 94, satisfaccion: 92 },
    { mes: 'Ene', unidades: 61, conversion: 81, eficiencia: 86, satisfaccion: 84 },
    { mes: 'Feb', unidades: 68, conversion: 84, eficiencia: 87, satisfaccion: 86 },
];

// ─────────────────────────────────────────────
// SALE GENERATOR
// ─────────────────────────────────────────────
const generateSales = (cashierName) => {
    const seed = cashierName ? cashierName.charCodeAt(0) : 65;
    const perfs = Object.keys(PERF_CFG);

    return Array.from({ length: 20 }, (_, i) => {
        const daysAgo = i % 15;
        const d = new Date(2026, 1, 20 - daysAgo);
        const dateStr = d.toISOString().split('T')[0];
        const hour = 8 + ((seed + i * 3) % 9);
        const min = String(((seed + i * 7) % 60)).padStart(2, '0');
        const cat = CATEGORIES[(seed + i) % CATEGORIES.length];
        const qty = 1 + ((seed + i * 2) % 5);
        const durMin = 1 + ((seed + i * 5) % 8);
        const durSec = String(((seed + i * 11) % 60)).padStart(2, '0');
        return {
            id: `VTA-${String(i + 1).padStart(3, '0')}`,
            fecha: dateStr,
            hora: `${String(hour).padStart(2, '0')}:${min}`,
            categoria: cat,
            cantidad: qty,
            duracion: `${String(durMin).padStart(2, '0')}:${durSec}`,
            perf: perfs[((seed + i) % 4)],
            clienteId: `CLIENT-${String(((seed + i) % 15) + 1).padStart(3, '0')}`,
        };
    });
};

// ─────────────────────────────────────────────
// CUSTOM TOOLTIPS
// ─────────────────────────────────────────────
const BaseTooltip = ({ active, payload, label, unit = '' }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px',
            padding: '0.7rem 1rem', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '0.83rem',
        }}>
            <p style={{ fontWeight: '700', color: '#111827', marginBottom: '0.3rem' }}>{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color ?? p.stroke ?? p.fill, margin: '0.12rem 0' }}>
                    {p.name}: <strong>{p.value}{unit}</strong>
                </p>
            ))}
        </div>
    );
};

const PieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
        <div style={{
            background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px',
            padding: '0.7rem 1rem', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '0.83rem',
        }}>
            <p style={{ fontWeight: '700', color: d.payload.color }}>{d.name}</p>
            <p style={{ color: '#374151', margin: 0 }}>{d.value} atenciones ({d.payload.pct}%)</p>
        </div>
    );
};

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
export default function CashierSalesModal({ cashier, onClose }) {
    const cashierName = cashier?.username ?? 'Cajero';
    const allSales = useMemo(() => generateSales(cashierName), [cashierName]);

    const [selectedMonth, setSelectedMonth] = useState('Feb');
    const [filters, setFilters] = useState({ date: '', categoria: '', perf: '' });

    // Month slice
    const monthSales = useMemo(() => {
        const monthIdx = MONTHS.indexOf(selectedMonth);
        const mData = MONTHLY_TREND[monthIdx] ?? MONTHLY_TREND[11];
        const count = Math.min(Math.ceil(mData.unidades / 4), allSales.length);
        return Array.from({ length: count }, (_, i) =>
            allSales[(monthIdx * 2 + i) % allSales.length]
        );
    }, [selectedMonth, allSales]);

    const availableDates = useMemo(() => [...new Set(monthSales.map(s => s.fecha))].sort(), [monthSales]);

    const displaySales = useMemo(() => monthSales.filter(s => {
        if (filters.date && s.fecha !== filters.date) return false;
        if (filters.categoria && s.categoria !== filters.categoria) return false;
        if (filters.perf && s.perf !== filters.perf) return false;
        return true;
    }), [monthSales, filters]);

    const hasFilters = filters.date || filters.categoria || filters.perf;
    const clearFilters = () => setFilters({ date: '', categoria: '', perf: '' });

    // KPIs from trend data
    const mTrend = MONTHLY_TREND.find(m => m.mes === selectedMonth) ?? MONTHLY_TREND[11];

    // Rendimiento distribution for pie chart
    const perfDist = useMemo(() => {
        const counts = {};
        Object.keys(PERF_CFG).forEach(k => { counts[k] = 0; });
        monthSales.forEach(s => { counts[s.perf] = (counts[s.perf] || 0) + 1; });
        const total = monthSales.length || 1;
        return Object.entries(counts)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => ({
                name: k, value: v, pct: Math.round((v / total) * 100),
                color: PERF_CFG[k].pie,
            }));
    }, [monthSales]);

    // Category distribution for bar
    const catDist = useMemo(() => {
        const map = {};
        CATEGORIES.forEach(c => { map[c] = 0; });
        monthSales.forEach(s => { map[s.categoria] = (map[s.categoria] || 0) + 1; });
        return CATEGORIES.map((c, i) => ({ cat: c, ventas: map[c], color: CAT_COLORS[i] }));
    }, [monthSales]);

    // Top performer category
    const topCat = catDist.reduce((a, b) => (b.ventas > a.ventas ? b : a), catDist[0]);

    // Radar data — performance dimensions vs benchmark
    const radarData = [
        { dim: 'Conversión', cajero: mTrend.conversion, meta: 80 },
        { dim: 'Eficiencia', cajero: mTrend.eficiencia, meta: 80 },
        { dim: 'Satisfacción', cajero: mTrend.satisfaccion, meta: 80 },
        { dim: 'Volumen', cajero: Math.round((mTrend.unidades / 110) * 100), meta: 80 },
        { dim: 'Consistencia', cajero: Math.round((mTrend.eficiencia + mTrend.conversion) / 2), meta: 80 },
    ];

    // ── Styles ──
    const overlay = {
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.72)', backdropFilter: 'blur(6px)',
        zIndex: 1300, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem',
    };
    const panel = {
        background: '#f8fafc', borderRadius: '20px',
        width: '100%', maxWidth: '1200px', maxHeight: '94vh', overflowY: 'auto',
        boxShadow: '0 32px 64px -12px rgba(0,0,0,0.42)',
        display: 'flex', flexDirection: 'column',
        animation: 'salesModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
    };

    return (
        <>
            <div style={overlay} onClick={onClose}>
                <div style={panel} onClick={e => e.stopPropagation()}>

                    {/* ─── HEADER ─── */}
                    <div style={{
                        padding: '1.75rem 2rem',
                        background: 'linear-gradient(135deg, #0f172a 0%, #065f46 55%, #10b981 100%)',
                        borderRadius: '20px 20px 0 0',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.3rem' }}>
                                <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: '10px', padding: '0.45rem 0.7rem', fontSize: '1.1rem' }}>📈</div>
                                <h2 style={{ color: 'white', fontSize: '1.4rem', fontWeight: '800', margin: 0, letterSpacing: '-0.02em' }}>
                                    Rendimiento y Productividad
                                </h2>
                            </div>
                            <p style={{ color: '#6ee7b7', margin: 0, fontSize: '0.88rem', fontWeight: '500' }}>
                                {cashierName} &nbsp;·&nbsp; Análisis de desempeño operativo
                            </p>
                        </div>
                        <button onClick={onClose} style={{
                            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
                            borderRadius: '10px', width: '36px', height: '36px', cursor: 'pointer', color: 'white',
                            fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        >✕</button>
                    </div>

                    <div style={{ padding: '1.75rem 2rem', flex: 1 }}>

                        {/* ─── MONTH PILLS ─── */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Período</span>
                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                {MONTHS.map(m => {
                                    const active = selectedMonth === m;
                                    return (
                                        <button key={m} onClick={() => { setSelectedMonth(m); clearFilters(); }} style={{
                                            padding: '0.3rem 0.75rem', borderRadius: '8px',
                                            border: `1px solid ${active ? '#10b981' : '#e2e8f0'}`,
                                            background: active ? '#10b981' : 'white',
                                            color: active ? 'white' : '#64748b',
                                            fontWeight: active ? '600' : '400',
                                            fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.14s',
                                            boxShadow: active ? '0 2px 8px rgba(16,185,129,0.3)' : 'none',
                                        }}>{m}</button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ─── KPI CARDS ─── */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
                            {[
                                { label: 'Atenciones', value: mTrend.unidades, icon: '📦', gradient: 'linear-gradient(135deg,#065f46,#10b981)', sub: 'transacciones del mes' },
                                { label: 'Conversión', value: `${mTrend.conversion}%`, icon: '🎯', gradient: 'linear-gradient(135deg,#1e40af,#3b82f6)', sub: 'clientes → cierre' },
                                { label: 'Eficiencia', value: `${mTrend.eficiencia}%`, icon: '⚡', gradient: 'linear-gradient(135deg,#6d28d9,#8b5cf6)', sub: 'índice operativo' },
                                { label: 'Satisfacción', value: `${mTrend.satisfaccion}%`, icon: '⭐', gradient: 'linear-gradient(135deg,#0f766e,#14b8a6)', sub: 'percepción del cliente' },
                                { label: 'Top Categoría', value: topCat?.cat ?? '—', icon: '🏆', gradient: 'linear-gradient(135deg,#92400e,#f59e0b)', sub: 'mayor volumen' },
                            ].map((k, i) => (
                                <div key={i} style={{
                                    background: 'white', borderRadius: '14px', padding: '1.1rem 1.25rem',
                                    border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                                    position: 'relative', overflow: 'hidden',
                                }}>
                                    <div style={{
                                        position: 'absolute', top: 0, right: 0, width: '70px', height: '70px',
                                        background: k.gradient, opacity: 0.07, borderRadius: '0 14px 0 100%',
                                    }} />
                                    <div style={{
                                        width: '30px', height: '30px', borderRadius: '8px', background: k.gradient,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', marginBottom: '0.5rem',
                                    }}>{k.icon}</div>
                                    <div style={{ fontSize: '1.55rem', fontWeight: '800', color: '#0f172a', lineHeight: 1 }}>{k.value}</div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.25rem', fontWeight: '600' }}>{k.label}</div>
                                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.1rem' }}>{k.sub}</div>
                                </div>
                            ))}
                        </div>

                        {/* ─── CHARTS ROW 1: Trend + Radar ─── */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>

                            {/* Area trend */}
                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: '0 0 0.2rem' }}>Tendencia Anual — Indicadores Clave</h3>
                                <p style={{ color: '#94a3b8', fontSize: '0.76rem', margin: '0 0 1rem' }}>Conversión · Eficiencia · Satisfacción (%)</p>
                                <div style={{ height: 200 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={MONTHLY_TREND} margin={{ top: 4, right: 10, left: -20, bottom: 4 }}>
                                            <defs>
                                                {[['conv', '#3b82f6'], ['efic', '#10b981'], ['sat', '#8b5cf6']].map(([id, col]) => (
                                                    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={col} stopOpacity={0.18} />
                                                        <stop offset="95%" stopColor={col} stopOpacity={0} />
                                                    </linearGradient>
                                                ))}
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={6} />
                                            <YAxis domain={[60, 100]} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                            <RechartsTooltip content={<BaseTooltip unit="%" />} />
                                            <Area type="monotone" dataKey="conversion" name="Conversión" stroke="#3b82f6" fill="url(#conv)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                                            <Area type="monotone" dataKey="eficiencia" name="Eficiencia" stroke="#10b981" fill="url(#efic)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                                            <Area type="monotone" dataKey="satisfaccion" name="Satisfacción" stroke="#8b5cf6" fill="url(#sat)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{ display: 'flex', gap: '1.2rem', fontSize: '0.74rem', color: '#64748b', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                    {[['#3b82f6', 'Conversión'], ['#10b981', 'Eficiencia'], ['#8b5cf6', 'Satisfacción']].map(([c, l]) => (
                                        <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <span style={{ width: '20px', height: '3px', background: c, borderRadius: '2px', display: 'inline-block' }} />{l}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Radar */}
                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: '0 0 0.2rem' }}>Perfil de Competencias</h3>
                                <p style={{ color: '#94a3b8', fontSize: '0.76rem', margin: '0 0 0.5rem' }}>{selectedMonth} vs. meta (80)</p>
                                <div style={{ height: 210 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                                            <PolarGrid stroke="#e2e8f0" />
                                            <PolarAngleAxis dataKey="dim" tick={{ fill: '#64748b', fontSize: 11 }} />
                                            <Radar name="Meta" dataKey="meta" stroke="#e2e8f0" fill="#f1f5f9" fillOpacity={0.7} strokeWidth={1} />
                                            <Radar name={cashierName} dataKey="cajero" stroke="#10b981" fill="#10b981" fillOpacity={0.25} strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} />
                                            <RechartsTooltip content={<BaseTooltip />} />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* ─── CHARTS ROW 2: Volume bar + Rendimiento pie + Category ─── */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.2fr', gap: '1.25rem', marginBottom: '1.75rem' }}>

                            {/* Volume bar */}
                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: '0 0 0.2rem' }}>Volumen de Atenciones</h3>
                                <p style={{ color: '#94a3b8', fontSize: '0.76rem', margin: '0 0 1rem' }}>Unidades procesadas por mes</p>
                                <div style={{ height: 185 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={MONTHLY_TREND} margin={{ top: 4, right: 10, left: -20, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} dy={6} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                            <RechartsTooltip content={<BaseTooltip />} />
                                            <Bar dataKey="unidades" name="Atenciones" radius={[4, 4, 0, 0]}>
                                                {MONTHLY_TREND.map((m, idx) => (
                                                    <Cell key={idx} fill={m.mes === selectedMonth ? '#10b981' : '#d1fae5'} />
                                                ))}
                                            </Bar>
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Rendimiento pie */}
                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: '0 0 0.2rem' }}>Distribución Rendimiento</h3>
                                <p style={{ color: '#94a3b8', fontSize: '0.76rem', margin: '0 0 0.5rem' }}>{selectedMonth} 2026</p>
                                <div style={{ height: 160 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={perfDist} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3}>
                                                {perfDist.map((d, i) => <Cell key={i} fill={d.color} />)}
                                            </Pie>
                                            <RechartsTooltip content={<PieTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.25rem' }}>
                                    {perfDist.map(d => (
                                        <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                                                <span style={{ color: '#64748b' }}>{d.name}</span>
                                            </span>
                                            <span style={{ fontWeight: '700', color: '#0f172a' }}>{d.pct}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Category breakdown */}
                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: '0 0 0.2rem' }}>Atenciones por Categoría</h3>
                                <p style={{ color: '#94a3b8', fontSize: '0.76rem', margin: '0 0 1rem' }}>{selectedMonth} 2026</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                                    {catDist.sort((a, b) => b.ventas - a.ventas).map((cat) => {
                                        const max = catDist.reduce((m, c) => Math.max(m, c.ventas), 0) || 1;
                                        const pct = (cat.ventas / max) * 100;
                                        return (
                                            <div key={cat.cat}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem', fontSize: '0.78rem' }}>
                                                    <span style={{ fontWeight: '600', color: '#475569' }}>{cat.cat}</span>
                                                    <span style={{ fontWeight: '700', color: '#0f172a' }}>{cat.ventas} att.</span>
                                                </div>
                                                <div style={{ background: '#f1f5f9', borderRadius: '4px', height: '7px', overflow: 'hidden' }}>
                                                    <div style={{
                                                        width: `${pct}%`, height: '100%',
                                                        background: CAT_COLORS[CATEGORIES.indexOf(cat.cat) % CAT_COLORS.length],
                                                        borderRadius: '4px', transition: 'width 0.4s ease',
                                                    }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* ─── FILTER BAR ─── */}
                        <div style={{
                            background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0',
                            padding: '1rem 1.25rem', marginBottom: '1rem',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                            display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
                        }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
                                Filtrar por
                            </span>

                            {/* Day */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <label style={{ fontSize: '0.68rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Día</label>
                                <select value={filters.date} onChange={e => setFilters(f => ({ ...f, date: e.target.value }))} style={{
                                    padding: '0.35rem 0.65rem', borderRadius: '7px',
                                    border: `1px solid ${filters.date ? '#10b981' : '#e2e8f0'}`,
                                    background: filters.date ? '#d1fae5' : 'white',
                                    color: filters.date ? '#065f46' : '#475569',
                                    fontSize: '0.82rem', cursor: 'pointer', outline: 'none',
                                    fontWeight: filters.date ? '600' : '400', minWidth: '130px',
                                }}>
                                    <option value=''>Todos los días</option>
                                    {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>

                            <div style={{ width: '1px', height: '32px', background: '#e2e8f0', flexShrink: 0 }} />

                            {/* Categoría */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <label style={{ fontSize: '0.68rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Categoría</label>
                                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                    {CATEGORIES.map((cat, ci) => {
                                        const active = filters.categoria === cat;
                                        return (
                                            <button key={cat} onClick={() => setFilters(f => ({ ...f, categoria: active ? '' : cat }))} style={{
                                                padding: '0.32rem 0.65rem', borderRadius: '7px', fontSize: '0.76rem',
                                                fontWeight: active ? '700' : '500', cursor: 'pointer',
                                                border: `1px solid ${active ? CAT_COLORS[ci] + '80' : '#e2e8f0'}`,
                                                background: active ? CAT_BGS[ci] : 'white',
                                                color: active ? CAT_COLORS[ci] : '#94a3b8',
                                                transition: 'all 0.12s',
                                            }}
                                                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = CAT_BGS[ci]; e.currentTarget.style.color = CAT_COLORS[ci]; } }}
                                                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#94a3b8'; } }}
                                            >{cat}</button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ width: '1px', height: '32px', background: '#e2e8f0', flexShrink: 0 }} />

                            {/* Rendimiento */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <label style={{ fontSize: '0.68rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rendimiento</label>
                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                    {Object.keys(PERF_CFG).map(p => {
                                        const pc = PERF_CFG[p];
                                        const active = filters.perf === p;
                                        return (
                                            <button key={p} onClick={() => setFilters(f => ({ ...f, perf: active ? '' : p }))} style={{
                                                padding: '0.32rem 0.65rem', borderRadius: '7px', fontSize: '0.76rem',
                                                fontWeight: active ? '700' : '500', cursor: 'pointer',
                                                border: `1px solid ${active ? pc.border : '#e2e8f0'}`,
                                                background: active ? pc.bg : 'white',
                                                color: active ? pc.color : '#94a3b8',
                                                transition: 'all 0.12s',
                                            }}
                                                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = pc.bg; e.currentTarget.style.color = pc.color; e.currentTarget.style.borderColor = pc.border; } }}
                                                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#e2e8f0'; } }}
                                            >{p}</button>
                                        );
                                    })}
                                </div>
                            </div>

                            {hasFilters && (
                                <button onClick={clearFilters} style={{
                                    marginLeft: 'auto', padding: '0.35rem 0.85rem',
                                    borderRadius: '7px', fontSize: '0.78rem', fontWeight: '600',
                                    border: '1px solid #fca5a5', background: '#fee2e2',
                                    color: '#991b1b', cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#fecaca'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#fee2e2'; }}
                                >Limpiar filtros</button>
                            )}
                        </div>

                        {/* ─── TABLE ─── */}
                        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                            <div style={{
                                padding: '0.9rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <div>
                                    <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>Registro de Atenciones</span>
                                    <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: '0.6rem' }}>{selectedMonth} 2026{hasFilters ? ' — filtrado' : ''}</span>
                                </div>
                                <span style={{
                                    background: '#d1fae5', color: '#065f46', borderRadius: '20px', padding: '0.2rem 0.8rem',
                                    fontSize: '0.78rem', fontWeight: '700', border: '1px solid #6ee7b7',
                                }}>{displaySales.length} registros</span>
                            </div>

                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '780px' }}>
                                    <thead>
                                        <tr style={{ background: '#f1f5f9' }}>
                                            {['Atención', 'Cliente', 'Fecha', 'Hora', 'Duración', 'Categoría', 'Cantidad', 'Rendimiento'].map(h => (
                                                <th key={h} style={{
                                                    padding: '0.65rem 1rem', textAlign: 'left',
                                                    fontSize: '0.7rem', fontWeight: '700', color: '#64748b',
                                                    textTransform: 'uppercase', letterSpacing: '0.07em',
                                                    borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                                                }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displaySales.map((sale, idx) => {
                                            const pc = PERF_CFG[sale.perf] ?? PERF_CFG.Bueno;
                                            const catIdx = CATEGORIES.indexOf(sale.categoria);
                                            const isEven = idx % 2 === 0;
                                            return (
                                                <tr key={sale.id + idx} style={{
                                                    background: isEven ? 'white' : '#fafbfc',
                                                    transition: 'background 0.12s', borderBottom: '1px solid #f1f5f9',
                                                }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                                                    onMouseLeave={e => e.currentTarget.style.background = isEven ? 'white' : '#fafbfc'}
                                                >
                                                    <td style={{ padding: '0.75rem 1rem' }}>
                                                        <span style={{
                                                            fontFamily: "'Courier New',monospace", fontWeight: '700',
                                                            color: '#065f46', fontSize: '0.85rem',
                                                            background: '#d1fae5', padding: '0.18rem 0.5rem',
                                                            borderRadius: '5px', border: '1px solid #6ee7b7',
                                                        }}>{sale.id}</span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem' }}>
                                                        <span style={{
                                                            fontFamily: "'Courier New',monospace", fontWeight: '600',
                                                            color: '#1e40af', fontSize: '0.82rem',
                                                            background: '#eff6ff', padding: '0.15rem 0.45rem',
                                                            borderRadius: '5px', border: '1px solid #bfdbfe',
                                                        }}>{sale.clienteId}</span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.83rem', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{sale.fecha}</td>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.83rem', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{sale.hora}</td>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.83rem', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{sale.duracion}</td>
                                                    <td style={{ padding: '0.75rem 1rem' }}>
                                                        <span style={{
                                                            background: CAT_BGS[catIdx % CAT_BGS.length],
                                                            color: CAT_COLORS[catIdx % CAT_COLORS.length],
                                                            padding: '0.2rem 0.55rem', borderRadius: '6px',
                                                            fontSize: '0.74rem', fontWeight: '700', display: 'inline-block', whiteSpace: 'nowrap',
                                                        }}>{sale.categoria}</span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.84rem', color: '#334155', fontWeight: '600', textAlign: 'center' }}>{sale.cantidad}</td>
                                                    <td style={{ padding: '0.75rem 1rem' }}>
                                                        <span style={{
                                                            background: pc.bg, color: pc.color,
                                                            border: `1px solid ${pc.border}`,
                                                            padding: '0.2rem 0.6rem', borderRadius: '6px',
                                                            fontSize: '0.74rem', fontWeight: '700', display: 'inline-block',
                                                        }}>{sale.perf}</span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {displaySales.length === 0 && (
                                            <tr><td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontSize: '0.9rem' }}>
                                                Sin registros para los filtros seleccionados.
                                            </td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes salesModalIn {
                    from { opacity:0; transform:translateY(18px) scale(0.97); }
                    to   { opacity:1; transform:translateY(0) scale(1); }
                }
            `}</style>
        </>
    );
}
