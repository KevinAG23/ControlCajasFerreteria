import React, { useState, useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
    ComposedChart, Bar, Cell,
    PieChart, Pie,
    RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import { getEcuadorDateString, getEcuadorTimeStringWithSeconds } from '../../utils/date';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const RATINGS = ['Eficiente', 'Bueno', 'Malo', 'Ineficiente'];

const RATING_CFG = {
    Eficiente: { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7', dot: '#10b981' },
    Bueno: { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd', dot: '#3b82f6' },
    Malo: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d', dot: '#f59e0b' },
    Ineficiente: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', dot: '#ef4444' },
};

const SENTIMENT_CFG = {
    Positivo: { bg: '#d1fae5', color: '#065f46', label: 'Positivo' },
    Neutral: { bg: '#fef3c7', color: '#92400e', label: 'Neutral' },
    Negativo: { bg: '#fee2e2', color: '#991b1b', label: 'Negativo' },
};

const MONTHS = ['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Ene', 'Feb'];

const ALL_YEARS_TREND = {
    2023: [
        { mes: 'Mar', clientes: 30, sentimiento: 6.8, unidades: 28, conversion: 62, eficiencia: 70, satisfaccion: 68 },
        { mes: 'Abr', clientes: 45, sentimiento: 6.5, unidades: 40, conversion: 67, eficiencia: 72, satisfaccion: 69 },
        { mes: 'May', clientes: 38, sentimiento: 7.0, unidades: 33, conversion: 64, eficiencia: 68, satisfaccion: 65 },
        { mes: 'Jun', clientes: 50, sentimiento: 6.9, unidades: 46, conversion: 70, eficiencia: 74, satisfaccion: 71 },
        { mes: 'Jul', clientes: 55, sentimiento: 7.4, unidades: 50, conversion: 72, eficiencia: 76, satisfaccion: 73 },
        { mes: 'Ago', clientes: 48, sentimiento: 7.0, unidades: 43, conversion: 68, eficiencia: 73, satisfaccion: 72 },
        { mes: 'Sep', clientes: 40, sentimiento: 6.6, unidades: 36, conversion: 63, eficiencia: 67, satisfaccion: 64 },
        { mes: 'Oct', clientes: 57, sentimiento: 7.2, unidades: 55, conversion: 74, eficiencia: 77, satisfaccion: 75 },
        { mes: 'Nov', clientes: 65, sentimiento: 7.6, unidades: 68, conversion: 77, eficiencia: 80, satisfaccion: 78 },
        { mes: 'Dic', clientes: 74, sentimiento: 8.0, unidades: 90, conversion: 81, eficiencia: 83, satisfaccion: 80 },
        { mes: 'Ene', clientes: 52, sentimiento: 7.1, unidades: 47, conversion: 70, eficiencia: 75, satisfaccion: 73 },
        { mes: 'Feb', clientes: 60, sentimiento: 7.3, unidades: 54, conversion: 73, eficiencia: 76, satisfaccion: 74 },
    ],
    2024: [
        { mes: 'Mar', clientes: 36, sentimiento: 7.2, unidades: 33, conversion: 67, eficiencia: 74, satisfaccion: 72 },
        { mes: 'Abr', clientes: 52, sentimiento: 6.9, unidades: 47, conversion: 73, eficiencia: 78, satisfaccion: 75 },
        { mes: 'May', clientes: 44, sentimiento: 7.6, unidades: 40, conversion: 70, eficiencia: 73, satisfaccion: 70 },
        { mes: 'Jun', clientes: 58, sentimiento: 7.4, unidades: 53, conversion: 75, eficiencia: 80, satisfaccion: 77 },
        { mes: 'Jul', clientes: 63, sentimiento: 7.9, unidades: 58, conversion: 78, eficiencia: 82, satisfaccion: 79 },
        { mes: 'Ago', clientes: 56, sentimiento: 7.5, unidades: 51, conversion: 74, eficiencia: 79, satisfaccion: 77 },
        { mes: 'Sep', clientes: 48, sentimiento: 7.1, unidades: 43, conversion: 69, eficiencia: 73, satisfaccion: 70 },
        { mes: 'Oct', clientes: 65, sentimiento: 7.8, unidades: 63, conversion: 80, eficiencia: 84, satisfaccion: 81 },
        { mes: 'Nov', clientes: 72, sentimiento: 8.2, unidades: 75, conversion: 83, eficiencia: 86, satisfaccion: 83 },
        { mes: 'Dic', clientes: 82, sentimiento: 8.6, unidades: 100, conversion: 87, eficiencia: 89, satisfaccion: 87 },
        { mes: 'Ene', clientes: 61, sentimiento: 7.5, unidades: 55, conversion: 76, eficiencia: 81, satisfaccion: 79 },
        { mes: 'Feb', clientes: 68, sentimiento: 7.9, unidades: 62, conversion: 79, eficiencia: 83, satisfaccion: 80 },
    ],
    2025: [
        { mes: 'Mar', clientes: 42, sentimiento: 7.8, unidades: 38, conversion: 72, eficiencia: 80, satisfaccion: 78 },
        { mes: 'Abr', clientes: 58, sentimiento: 7.2, unidades: 52, conversion: 78, eficiencia: 83, satisfaccion: 81 },
        { mes: 'May', clientes: 51, sentimiento: 8.1, unidades: 47, conversion: 75, eficiencia: 79, satisfaccion: 76 },
        { mes: 'Jun', clientes: 65, sentimiento: 7.9, unidades: 60, conversion: 80, eficiencia: 85, satisfaccion: 82 },
        { mes: 'Jul', clientes: 70, sentimiento: 8.5, unidades: 65, conversion: 83, eficiencia: 88, satisfaccion: 85 },
        { mes: 'Ago', clientes: 63, sentimiento: 8.0, unidades: 57, conversion: 79, eficiencia: 84, satisfaccion: 83 },
        { mes: 'Sep', clientes: 55, sentimiento: 7.6, unidades: 49, conversion: 74, eficiencia: 78, satisfaccion: 75 },
        { mes: 'Oct', clientes: 72, sentimiento: 8.3, unidades: 70, conversion: 85, eficiencia: 89, satisfaccion: 87 },
        { mes: 'Nov', clientes: 80, sentimiento: 8.7, unidades: 82, conversion: 88, eficiencia: 91, satisfaccion: 89 },
        { mes: 'Dic', clientes: 90, sentimiento: 9.1, unidades: 110, conversion: 92, eficiencia: 94, satisfaccion: 92 },
        { mes: 'Ene', clientes: 68, sentimiento: 8.0, unidades: 61, conversion: 81, eficiencia: 86, satisfaccion: 84 },
        { mes: 'Feb', clientes: 75, sentimiento: 8.4, unidades: 68, conversion: 84, eficiencia: 87, satisfaccion: 86 },
    ],
    2026: [
        { mes: 'Mar', clientes: 48, sentimiento: 8.2, unidades: 44, conversion: 76, eficiencia: 83, satisfaccion: 81 },
        { mes: 'Abr', clientes: 64, sentimiento: 7.8, unidades: 58, conversion: 81, eficiencia: 86, satisfaccion: 84 },
        { mes: 'May', clientes: 56, sentimiento: 8.5, unidades: 52, conversion: 78, eficiencia: 82, satisfaccion: 80 },
        { mes: 'Jun', clientes: 70, sentimiento: 8.3, unidades: 65, conversion: 84, eficiencia: 88, satisfaccion: 85 },
        { mes: 'Jul', clientes: 76, sentimiento: 8.8, unidades: 71, conversion: 86, eficiencia: 91, satisfaccion: 88 },
        { mes: 'Ago', clientes: 69, sentimiento: 8.4, unidades: 63, conversion: 82, eficiencia: 87, satisfaccion: 86 },
        { mes: 'Sep', clientes: 60, sentimiento: 8.0, unidades: 54, conversion: 77, eficiencia: 81, satisfaccion: 78 },
        { mes: 'Oct', clientes: 78, sentimiento: 8.7, unidades: 76, conversion: 88, eficiencia: 92, satisfaccion: 90 },
        { mes: 'Nov', clientes: 86, sentimiento: 9.0, unidades: 88, conversion: 91, eficiencia: 94, satisfaccion: 92 },
        { mes: 'Dic', clientes: 95, sentimiento: 9.4, unidades: 115, conversion: 94, eficiencia: 96, satisfaccion: 95 },
        { mes: 'Ene', clientes: 73, sentimiento: 8.3, unidades: 66, conversion: 84, eficiencia: 89, satisfaccion: 87 },
        { mes: 'Feb', clientes: 80, sentimiento: 8.7, unidades: 73, conversion: 87, eficiencia: 91, satisfaccion: 89 },
    ],
};

const AVAILABLE_YEARS = [2023, 2024, 2025, 2026];


const PERF_CFG = {
    Excelente: { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7', pie: '#10b981' },
    Bueno: { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd', pie: '#3b82f6' },
    Regular: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d', pie: '#f59e0b' },
    Bajo: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', pie: '#ef4444' },
};



// ─────────────────────────────────────────────
// MOCK TRANSCRIPTIONS
// ─────────────────────────────────────────────
const MOCK_TRANSCRIPCIONES = [
    `[00:00 - 00:05] CAJERO: Buenos días, ¿en qué le puedo ayudar?
[00:06 - 00:15] CLIENTE: Necesito comprar tóner para impresora HP, modelo 85A.
[00:16 - 00:25] CAJERO: Perfecto, déjeme verificar el inventario. Sí, tenemos disponible. ¿Necesita alguno más?
[00:26 - 00:30] CLIENTE: Solo uno, por favor.
[00:31 - 00:45] CAJERO: Listo. El total son $28.50. ¿Va a pagar en efectivo o con tarjeta?
[00:46 - 00:50] CLIENTE: Con tarjeta.
[00:51 - 01:05] CAJERO: Perfecto. ¿Desea factura con datos o consumidor final?
[01:06 - 01:10] CLIENTE: Consumidor final.
[01:11 - 01:20] CAJERO: Aquí tiene su comprobante. Que tenga excelente día.
[01:21 - 01:25] CLIENTE: Gracias, igualmente.`,

    `[00:00 - 00:04] CAJERO: Buen día, bienvenido.
[00:05 - 00:20] CLIENTE: Hola, quisiera saber si tienen papel bond resma carta.
[00:21 - 00:30] CAJERO: Sí señor, tenemos de la marca Report y también genérico.
[00:31 - 00:40] CLIENTE: ¿Cuál me recomienda para uso de oficina?
[00:41 - 00:55] CAJERO: Le recomendaría Report, 75gr, mejor durabilidad en impresión.
[00:56 - 01:00] CLIENTE: Está bien, llevo dos resmas.
[01:01 - 01:15] CAJERO: Dos resmas Report carta. Total: $11.80. ¿Tiene membresía?
[01:16 - 01:20] CLIENTE: No tengo.
[01:21 - 01:35] CAJERO: Le puedo registrar ahora si gusta, es gratuita y acumula puntos.
[01:36 - 01:40] CLIENTE: Sí, gracias.`,

    `[00:00 - 00:06] CAJERO: Buenos días, ¿le ayudo en algo?
[00:07 - 00:18] CLIENTE: Sí, vengo a retirar un pedido en línea, número 45782.
[00:19 - 00:30] CAJERO: Un momento, verifico el sistema. Sí, aquí está. ¿Me permite una identificación?
[00:31 - 00:35] CLIENTE: Aquí tiene mi cédula.
[00:36 - 00:50] CAJERO: Verificado. Déjeme ir por su pedido a bodega.
[01:10 - 01:25] CAJERO: Aquí tiene, son dos cajas. ¿Le ayudo a cargarlas?
[01:26 - 01:45] CAJERO: Con gusto. Recuerde que tiene 30 días para cambio si algo no está correcto.
[01:46 - 01:50] CLIENTE: Gracias, muy amable.`,

    `[00:00 - 00:05] CAJERO: Buenas tardes, bienvenido.
[00:06 - 00:20] CLIENTE: Mire, me vendieron esto la semana pasada y no funciona.
[00:21 - 00:35] CAJERO: Entiendo, lamento el inconveniente. ¿Tiene su comprobante de compra?
[00:36 - 00:40] CLIENTE: Sí, aquí.
[00:41 - 01:00] CAJERO: Tiene garantía activa. Podemos hacer el cambio o devolverle el dinero.
[01:01 - 01:10] CLIENTE: Prefiero el cambio. ¿Tienen el mismo modelo?
[01:11 - 01:35] CAJERO: Sí, tenemos en inventario. Aquí está su reemplazo, ya lo registré.
[01:36 - 01:40] CLIENTE: Gracias por resolver rápido.`,

    `[00:00 - 00:04] CAJERO: Buenos días.
[00:05 - 00:15] CLIENTE: Buenos días, ¿tienen teclados inalámbricos?
[00:16 - 00:28] CAJERO: Sí, varias opciones. Desde básicos hasta ergonómicos con pad numérico.
[00:29 - 00:50] CAJERO: El Logitech MK270 es el más popular, garantía 3 años, batería hasta 2 años.
[00:51 - 01:05] CLIENTE: ¿Y el precio? CAJERO: $34.99, o con mouse incluido por $45.
[01:06 - 01:25] CLIENTE: Mejor llevo el combo. CAJERO: Excelente, lo agrego. Total $45.00.
[01:26 - 01:30] CLIENTE: Perfecto, gracias.`,
];

// ─────────────────────────────────────────────
// CLIENT DATA GENERATOR  (no names — only ID by day)
// ─────────────────────────────────────────────
const generateClients = (cashierId, recordings) => {
    const userRecs = recordings.filter(r => r.usuario_id === cashierId && r.transcripcion);
    
    return userRecs.map((r) => {
        const d = r.fecha_hora_inicio ? new Date(r.fecha_hora_inicio) : new Date();
        const dateStr = getEcuadorDateString(d);
        const timeStr = getEcuadorTimeStringWithSeconds(d);
        
        let durText = "00:00";
        if (r.fecha_hora_inicio && r.fecha_hora_fin) {
            const diff = new Date(r.fecha_hora_fin) - new Date(r.fecha_hora_inicio);
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            durText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }

        const score = r.analisis?.calificacion_general || 0;
        let rating = 'Ineficiente';
        if (score >= 90) rating = 'Eficiente';
        else if (score >= 80) rating = 'Bueno';
        else if (score >= 70) rating = 'Malo';

        let sentiment = 'Neutral';
        if (score >= 80) sentiment = 'Positivo';
        else if (score < 70 && score > 0) sentiment = 'Negativo';

        return {
            id: `REC-${r.id.substring(0, 8)}`,
            rawId: r.id,
            fecha: dateStr,
            hora: timeStr,
            duracion: durText,
            sentiment: sentiment,
            transcripcion: r.transcripcion,
            rating: rating,
        };
    });
};

// ─────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────
const storageKey = (id) => `ccm_ratings_${id}`;
const loadRatings = (id) => {
    try { return JSON.parse(localStorage.getItem(storageKey(id)) || '{}'); }
    catch { return {}; }
};
const saveRatings = (id, r) => {
    try { localStorage.setItem(storageKey(id), JSON.stringify(r)); } catch { /**/ }
};

// ─────────────────────────────────────────────
// CUSTOM TOOLTIPS
// ─────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px',
            padding: '0.75rem 1rem', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            fontSize: '0.85rem',
        }}>
            <p style={{ fontWeight: '700', color: '#111827', marginBottom: '0.4rem' }}>{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.stroke, margin: '0.15rem 0' }}>
                    {p.name}: <strong>{p.value}</strong>
                </p>
            ))}
        </div>
    );
};

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
export default function CashierClientsModal({ cashier, recordings = [], onClose }) {
    const cashierId = cashier?.id ?? 'default';
    const cashierName = cashier?.username ?? 'Cajero';

    const baseClients = useMemo(() => generateClients(cashierId, recordings), [cashierId, recordings]);

    const [clientRatings, setClientRatings] = useState(() => {
        const saved = loadRatings(cashierId);
        return Object.fromEntries(baseClients.map(c => [c.id, saved[c.id] || c.rating]));
    });

    const [selectedMonth, setSelectedMonth] = useState('Feb');
    const [selectedYear, setSelectedYear] = useState(2025);
    const [viewingTranscription, setViewingTranscription] = useState(null);

    // Datos del año activo
    const trendData = ALL_YEARS_TREND[selectedYear] ?? ALL_YEARS_TREND[2025];


    const clients = useMemo(
        () => baseClients.map(c => ({ ...c, rating: clientRatings[c.id] })),
        [baseClients, clientRatings],
    );

    // Filter by month — rotate slice to simulate different clients per month
    const filteredClients = useMemo(() => {
        const monthIdx = MONTHS.indexOf(selectedMonth);
        const mData = trendData[monthIdx] ?? trendData[11];
        const count = Math.min(Math.ceil(mData.clientes / 5), clients.length);
        return Array.from({ length: count }, (_, i) =>
            clients[(monthIdx * 2 + i) % clients.length]
        );
    }, [selectedMonth, selectedYear, clients, trendData]);

    const monthStats = useMemo(() => {
        const mData = trendData.find(m => m.mes === selectedMonth) ?? trendData[11];
        const pos = filteredClients.filter(c => c.rating === 'Eficiente' || c.rating === 'Bueno').length;
        return { total: mData.clientes, sentimentAvg: mData.sentimiento.toFixed(1), pos, neg: filteredClients.length - pos };
    }, [selectedMonth, selectedYear, filteredClients, trendData]);

    const handleRatingChange = (clientId, newRating) => {
        const updated = { ...clientRatings, [clientId]: newRating };
        setClientRatings(updated);
        saveRatings(cashierId, updated);
    };

    // ── Table-level secondary filters ──
    const [tableFilters, setTableFilters] = useState({ date: '', sentiment: '', rating: '' });

    const tableDisplayClients = useMemo(() => {
        return filteredClients.filter(c => {
            if (tableFilters.date && c.fecha !== tableFilters.date) return false;
            if (tableFilters.sentiment && c.sentiment !== tableFilters.sentiment) return false;
            if (tableFilters.rating && c.rating !== tableFilters.rating) return false;
            return true;
        });
    }, [filteredClients, tableFilters]);

    const clearTableFilters = () => setTableFilters({ date: '', sentiment: '', rating: '' });
    const hasActiveFilters = tableFilters.date || tableFilters.sentiment || tableFilters.rating;

    // Available dates in current month slice (for datepicker options)
    const availableDates = useMemo(() => [...new Set(filteredClients.map(c => c.fecha))].sort(), [filteredClients]);

    // ── Styles ──
    const modalOverlay = {
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.7)',
        backdropFilter: 'blur(6px)',
        zIndex: 1300,
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '1rem',
    };
    const modalPanel = {
        background: '#f8fafc',
        borderRadius: '20px',
        width: '100%', maxWidth: '1140px',
        maxHeight: '94vh', overflowY: 'auto',
        boxShadow: '0 32px 64px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column',
        animation: 'cliModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
    };

    return (
        <>
            {/* ── OVERLAY ── */}
            <div style={modalOverlay} onClick={onClose}>
                <div style={modalPanel} onClick={e => e.stopPropagation()}>

                    {/* ─── HEADER ─── */}
                    <div style={{
                        padding: '1.75rem 2rem',
                        background: 'linear-gradient(135deg, #92400e 0%, #b45309 55%, #d97706 100%)',
                        borderRadius: '20px 20px 0 0',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.3rem' }}>
                                <div style={{
                                    background: 'rgba(255,255,255,0.12)', borderRadius: '10px',
                                    padding: '0.45rem 0.7rem', fontSize: '1.1rem',
                                }}>👥</div>
                                <h2 style={{ color: 'white', fontSize: '1.4rem', fontWeight: '800', margin: 0, letterSpacing: '-0.02em' }}>
                                    Clientes Atendidos
                                </h2>
                            </div>
                            <p style={{ color: '#fde68a', margin: 0, fontSize: '0.88rem', fontWeight: '500' }}>
                                {cashierName} &nbsp;·&nbsp; Análisis mensualizado de atención
                            </p>
                        </div>
                        <button onClick={onClose} style={{
                            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
                            borderRadius: '10px', width: '36px', height: '36px', cursor: 'pointer', color: 'white',
                            fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, transition: 'background 0.15s',
                        }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        >✕</button>
                    </div>

                    <div style={{ padding: '1.75rem 2rem', flex: 1 }}>

                        {/* ─── YEAR + MONTH FILTER ─── */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '1.25rem',
                            marginBottom: '1.5rem', flexWrap: 'wrap',
                        }}>
                            {/* Selector de Año */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Año</span>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    {AVAILABLE_YEARS.map(yr => {
                                        const active = selectedYear === yr;
                                        return (
                                            <button key={yr} onClick={() => setSelectedYear(yr)} style={{
                                                padding: '0.3rem 0.65rem', borderRadius: '8px',
                                                border: `1px solid ${active ? '#0f172a' : '#e2e8f0'}`,
                                                background: active ? '#0f172a' : 'white',
                                                color: active ? 'white' : '#64748b',
                                                fontWeight: active ? '700' : '400',
                                                fontSize: '0.82rem', cursor: 'pointer',
                                                transition: 'all 0.14s',
                                                boxShadow: active ? '0 2px 8px rgba(15,23,42,0.35)' : 'none',
                                            }}>{yr}</button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Divider */}
                            <div style={{ width: '1px', height: '24px', background: '#e2e8f0', flexShrink: 0 }} />

                            {/* Selector de Mes */}
                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', flexShrink: 0 }}>Mes</span>
                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                {MONTHS.map(m => {
                                    const active = selectedMonth === m;
                                    return (
                                        <button key={m} onClick={() => setSelectedMonth(m)} style={{
                                            padding: '0.3rem 0.75rem', borderRadius: '8px',
                                            border: `1px solid ${active ? '#2563eb' : '#e2e8f0'}`,
                                            background: active ? '#2563eb' : 'white',
                                            color: active ? 'white' : '#64748b',
                                            fontWeight: active ? '600' : '400',
                                            fontSize: '0.82rem', cursor: 'pointer',
                                            transition: 'all 0.14s',
                                            boxShadow: active ? '0 2px 8px rgba(37,99,235,0.3)' : 'none',
                                        }}>
                                            {m}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ─── STAT CARDS ─── */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
                            {[
                                { label: 'Total Clientes', value: monthStats.total, icon: '👥', gradient: 'linear-gradient(135deg,#1e40af,#3b82f6)', sub: 'en el mes' },
                                { label: 'Sentimiento Prom.', value: `${monthStats.sentimentAvg}/10`, icon: '📊', gradient: 'linear-gradient(135deg,#065f46,#10b981)', sub: 'índice de satisfacción' },
                                { label: 'Atenciones Óptimas', value: monthStats.pos, icon: '✓', gradient: 'linear-gradient(135deg,#0f766e,#14b8a6)', sub: 'Eficiente + Bueno' },
                                { label: 'Por Mejorar', value: monthStats.neg, icon: '!', gradient: 'linear-gradient(135deg,#9a3412,#ef4444)', sub: 'Malo + Ineficiente' },
                            ].map((s, i) => (
                                <div key={i} style={{
                                    background: 'white', borderRadius: '14px',
                                    padding: '1.25rem 1.5rem',
                                    border: '1px solid #e2e8f0',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                                    position: 'relative', overflow: 'hidden',
                                }}>
                                    <div style={{
                                        position: 'absolute', top: 0, right: 0,
                                        width: '80px', height: '80px',
                                        background: s.gradient,
                                        opacity: 0.06, borderRadius: '0 14px 0 100%',
                                    }} />
                                    <div style={{
                                        width: '32px', height: '32px', borderRadius: '8px',
                                        background: s.gradient,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white', fontSize: '0.9rem', fontWeight: '700',
                                    }}>{s.icon}</div>
                                    <div>
                                        <div style={{ fontSize: '1.9rem', fontWeight: '800', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem', fontWeight: '500' }}>{s.label}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.1rem' }}>{s.sub}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ─── TREND CHART ─── */}
                        <div style={{
                            background: 'white', borderRadius: '16px',
                            border: '1px solid #e2e8f0', padding: '1.5rem',
                            marginBottom: '1.75rem',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                                        Tendencia Anual de Atención
                                    </h3>
                                    <p style={{ color: '#94a3b8', fontSize: '0.78rem', margin: '0.2rem 0 0' }}>
                                        Clientes atendidos vs. índice de sentimiento por mes
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.78rem', color: '#64748b' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <span style={{ width: '20px', height: '3px', background: '#3b82f6', borderRadius: '2px', display: 'inline-block' }} />
                                        Clientes
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <span style={{ width: '20px', height: '3px', background: '#10b981', borderRadius: '2px', display: 'inline-block', borderTop: '2px dashed #10b981' }} />
                                        Sentimiento
                                    </span>
                                </div>
                            </div>
                            <div style={{ height: 220 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={trendData} margin={{ top: 4, right: 16, left: -12, bottom: 4 }}>
                                        <defs>
                                            <linearGradient id="cliGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={6} />
                                        <YAxis yAxisId="l" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                        <YAxis yAxisId="r" orientation="right" domain={[6, 10]} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                        <RechartsTooltip content={<ChartTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} />
                                        <Line yAxisId="l" type="monotone" dataKey="clientes" name="Clientes"
                                            stroke="#3b82f6" strokeWidth={2.5}
                                            dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: 'white' }}
                                            activeDot={{ r: 6, fill: '#3b82f6', stroke: 'white', strokeWidth: 2 }} />
                                        <Line yAxisId="r" type="monotone" dataKey="sentimiento" name="Sentimiento"
                                            stroke="#10b981" strokeWidth={2.5} strokeDasharray="5 3"
                                            dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: 'white' }}
                                            activeDot={{ r: 6, fill: '#10b981', stroke: 'white', strokeWidth: 2 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* ─── CHARTS ROW: Volumen + Distribución Rendimiento + Perfil Competencias ─── */}
                        {(() => {
                            const mTrend = trendData.find(m => m.mes === selectedMonth) ?? trendData[11];
                            const monthIdx = MONTHS.indexOf(selectedMonth);
                            const count = Math.min(Math.ceil((trendData[monthIdx]?.unidades ?? 68) / 4), 20);
                            const perfs = Object.keys(PERF_CFG);
                            // Rendimiento distribution pie
                            const seed = cashierName ? cashierName.charCodeAt(0) : 65;
                            const tempSales = Array.from({ length: count }, (_, i) => perfs[((seed + monthIdx * 2 + i) % 4)]);

                            const perfCounts = {};
                            perfs.forEach(k => { perfCounts[k] = 0; });
                            tempSales.forEach(p => { perfCounts[p] = (perfCounts[p] || 0) + 1; });
                            const total = tempSales.length || 1;
                            const perfDist = Object.entries(perfCounts)
                                .filter(([, v]) => v > 0)
                                .map(([k, v]) => ({ name: k, value: v, pct: Math.round((v / total) * 100), color: PERF_CFG[k].pie }));

                            // Radar data
                            const radarData = [
                                { dim: 'Conversión', cajero: mTrend.conversion, meta: 80 },
                                { dim: 'Eficiencia', cajero: mTrend.eficiencia, meta: 80 },
                                { dim: 'Satisfacción', cajero: mTrend.satisfaccion, meta: 80 },
                                { dim: 'Volumen', cajero: Math.round((mTrend.unidades / 110) * 100), meta: 80 },
                                { dim: 'Consistencia', cajero: Math.round((mTrend.eficiencia + mTrend.conversion) / 2), meta: 80 },
                            ];

                            return (
                                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.2fr', gap: '1.25rem', marginBottom: '1.75rem' }}>

                                    {/* Volumen de Atenciones */}
                                    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                        <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: '0 0 0.2rem' }}>Volumen de Atenciones</h3>
                                        <p style={{ color: '#94a3b8', fontSize: '0.76rem', margin: '0 0 1rem' }}>Unidades procesadas por mes • {selectedYear}</p>
                                        <div style={{ height: 185 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={trendData} margin={{ top: 4, right: 10, left: -20, bottom: 4 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} dy={6} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                                    <RechartsTooltip content={<BaseTooltip />} />
                                                    <Bar dataKey="unidades" name="Atenciones" radius={[4, 4, 0, 0]}>
                                                        {trendData.map((m, idx) => (
                                                            <Cell key={idx} fill={m.mes === selectedMonth ? '#2563eb' : '#dbeafe'} />
                                                        ))}
                                                    </Bar>
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Distribución Rendimiento */}
                                    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                        <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: '0 0 0.2rem' }}>Distribución Rendimiento</h3>
                                        <p style={{ color: '#94a3b8', fontSize: '0.76rem', margin: '0 0 0.5rem' }}>{selectedMonth} {selectedYear}</p>
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

                                    {/* Perfil de Competencias */}
                                    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                        <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: '0 0 0.2rem' }}>Perfil de Competencias</h3>
                                        <p style={{ color: '#94a3b8', fontSize: '0.76rem', margin: '0 0 0.5rem' }}>{selectedMonth} vs. meta (80)</p>
                                        <div style={{ height: 210 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                                                    <PolarGrid stroke="#e2e8f0" />
                                                    <PolarAngleAxis dataKey="dim" tick={{ fill: '#64748b', fontSize: 11 }} />
                                                    <Radar name="Meta" dataKey="meta" stroke="#e2e8f0" fill="#f1f5f9" fillOpacity={0.7} strokeWidth={1} />
                                                    <Radar name={cashierName} dataKey="cajero" stroke="#2563eb" fill="#2563eb" fillOpacity={0.25} strokeWidth={2.5} dot={{ r: 3, fill: '#2563eb' }} />
                                                    <RechartsTooltip content={<BaseTooltip />} />
                                                </RadarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                </div>
                            );
                        })()}

                        {/* ─── FILTER BAR ─── */}
                        <div style={{
                            background: 'white', borderRadius: '14px',
                            border: '1px solid #e2e8f0',
                            padding: '1rem 1.25rem',
                            marginBottom: '1rem',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                            display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
                        }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
                                Filtrar por
                            </span>

                            {/* Date picker */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <label style={{ fontSize: '0.68rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Día</label>
                                <select
                                    value={tableFilters.date}
                                    onChange={e => setTableFilters(f => ({ ...f, date: e.target.value }))}
                                    style={{
                                        padding: '0.35rem 0.65rem', borderRadius: '7px',
                                        border: `1px solid ${tableFilters.date ? '#3b82f6' : '#e2e8f0'}`,
                                        background: tableFilters.date ? '#eff6ff' : 'white',
                                        color: tableFilters.date ? '#1e40af' : '#475569',
                                        fontSize: '0.82rem', cursor: 'pointer', outline: 'none',
                                        fontWeight: tableFilters.date ? '600' : '400',
                                        minWidth: '130px',
                                    }}
                                >
                                    <option value=''>Todos los días</option>
                                    {availableDates.map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Divider */}
                            <div style={{ width: '1px', height: '32px', background: '#e2e8f0', flexShrink: 0 }} />

                            {/* Sentiment filter */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <label style={{ fontSize: '0.68rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sentimiento</label>
                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                    {['Positivo', 'Neutral', 'Negativo'].map(s => {
                                        const sc = SENTIMENT_CFG[s];
                                        const active = tableFilters.sentiment === s;
                                        return (
                                            <button key={s} onClick={() => setTableFilters(f => ({ ...f, sentiment: active ? '' : s }))} style={{
                                                padding: '0.32rem 0.7rem', borderRadius: '7px', fontSize: '0.78rem',
                                                fontWeight: active ? '700' : '500', cursor: 'pointer',
                                                border: `1px solid ${active ? sc.color + '60' : '#e2e8f0'}`,
                                                background: active ? sc.bg : 'white',
                                                color: active ? sc.color : '#94a3b8',
                                                transition: 'all 0.12s',
                                                boxShadow: active ? `0 1px 4px ${sc.color}25` : 'none',
                                            }}
                                                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = sc.bg; e.currentTarget.style.color = sc.color; } }}
                                                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#94a3b8'; } }}
                                            >
                                                {s}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Divider */}
                            <div style={{ width: '1px', height: '32px', background: '#e2e8f0', flexShrink: 0 }} />

                            {/* Rating filter */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <label style={{ fontSize: '0.68rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Calificación</label>
                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                    {RATINGS.map(r => {
                                        const rc = RATING_CFG[r];
                                        const active = tableFilters.rating === r;
                                        return (
                                            <button key={r} onClick={() => setTableFilters(f => ({ ...f, rating: active ? '' : r }))} style={{
                                                padding: '0.32rem 0.7rem', borderRadius: '7px', fontSize: '0.78rem',
                                                fontWeight: active ? '700' : '500', cursor: 'pointer',
                                                border: `1px solid ${active ? rc.border : '#e2e8f0'}`,
                                                background: active ? rc.bg : 'white',
                                                color: active ? rc.color : '#94a3b8',
                                                transition: 'all 0.12s',
                                                boxShadow: active ? `0 1px 4px ${rc.border}60` : 'none',
                                            }}
                                                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = rc.bg; e.currentTarget.style.color = rc.color; e.currentTarget.style.borderColor = rc.border; } }}
                                                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#e2e8f0'; } }}
                                            >
                                                {r}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Clear button */}
                            {hasActiveFilters && (
                                <button onClick={clearTableFilters} style={{
                                    marginLeft: 'auto', padding: '0.35rem 0.85rem',
                                    borderRadius: '7px', fontSize: '0.78rem', fontWeight: '600',
                                    border: '1px solid #fca5a5', background: '#fee2e2',
                                    color: '#991b1b', cursor: 'pointer', transition: 'all 0.12s',
                                    whiteSpace: 'nowrap',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#fecaca'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#fee2e2'; }}
                                >
                                    Limpiar filtros
                                </button>
                            )}
                        </div>

                        {/* ─── CLIENT RECORDS LIST ─── */}
                        <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                            {/* Header bar */}
                            <div style={{
                                padding: '1rem 1.5rem',
                                background: 'linear-gradient(135deg, #431407 0%, #92400e 60%, #d97706 100%)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                                    <span style={{ fontSize: '1rem' }}>📋</span>
                                    <span style={{ fontSize: '0.95rem', fontWeight: '700', color: 'white' }}>Registro de Clientes</span>
                                    <span style={{ fontSize: '0.78rem', color: '#fde68a', fontWeight: '400' }}>
                                        {selectedMonth} {selectedYear}{hasActiveFilters ? ' — filtrado' : ''}
                                    </span>
                                </div>
                                <span style={{
                                    background: 'rgba(255,255,255,0.15)',
                                    color: 'white',
                                    borderRadius: '20px', padding: '0.2rem 0.85rem',
                                    fontSize: '0.78rem', fontWeight: '700',
                                    border: '1px solid rgba(255,255,255,0.22)',
                                }}>
                                    {tableDisplayClients.length} registros
                                </span>
                            </div>

                            {/* Column headers */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '110px 100px 75px 80px 105px 115px 65px 1fr',
                                padding: '0.55rem 1.2rem',
                                background: '#fafafa',
                                borderBottom: '1px solid #f1f5f9',
                                gap: '0.5rem',
                            }}>
                                {['Cliente', 'Fecha', 'Hora', 'Dur.', 'Sentimiento', 'Calificación', 'Detalle', 'Cambiar calificación'].map(h => (
                                    <span key={h} style={{ fontSize: '0.65rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
                                ))}
                            </div>

                            {/* Rows */}
                            <div style={{ background: 'white' }}>
                                <style>{`
                                    @keyframes rowSlide {
                                        from { opacity: 0; transform: translateX(-8px); }
                                        to   { opacity: 1; transform: translateX(0); }
                                    }
                                    .cli-row:hover { background: #fff7ed !important; }
                                    .cli-row:hover .cli-row-accent { opacity: 1 !important; }
                                `}</style>
                                {tableDisplayClients.length > 0 ? tableDisplayClients.map((client, idx) => {
                                    const rc = RATING_CFG[client.rating] ?? RATING_CFG.Bueno;
                                    const sc = SENTIMENT_CFG[client.sentiment] ?? SENTIMENT_CFG.Neutral;
                                    return (
                                        <div
                                            key={client.id + idx}
                                            className="cli-row"
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: '110px 100px 75px 80px 105px 115px 65px 1fr',
                                                alignItems: 'center',
                                                padding: '0.7rem 1.2rem',
                                                gap: '0.5rem',
                                                borderBottom: '1px solid #f8fafc',
                                                background: idx % 2 === 0 ? 'white' : '#fafafa',
                                                transition: 'background 0.15s',
                                                animation: `rowSlide 0.3s ease ${idx * 0.03}s both`,
                                                position: 'relative',
                                            }}
                                        >
                                            {/* left orange accent line */}
                                            <div className="cli-row-accent" style={{
                                                position: 'absolute', left: 0, top: '15%', bottom: '15%',
                                                width: '3px', borderRadius: '4px',
                                                background: '#f97316', opacity: 0,
                                                transition: 'opacity 0.2s',
                                            }} />

                                            {/* ID */}
                                            <span style={{
                                                fontFamily: "'Courier New', monospace",
                                                fontWeight: '700', color: '#92400e',
                                                fontSize: '0.8rem',
                                                background: '#fff7ed', padding: '0.18rem 0.45rem',
                                                borderRadius: '6px', border: '1px solid #fed7aa',
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            }}>{client.id}</span>

                                            {/* Fecha */}
                                            <span style={{ fontSize: '0.8rem', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{client.fecha}</span>

                                            {/* Hora */}
                                            <span style={{ fontSize: '0.8rem', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{client.hora}</span>

                                            {/* Dur */}
                                            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{client.duracion}</span>

                                            {/* Sentimiento */}
                                            <span style={{
                                                background: sc.bg, color: sc.color,
                                                padding: '0.22rem 0.6rem', borderRadius: '8px',
                                                fontSize: '0.73rem', fontWeight: '700',
                                                display: 'inline-block', whiteSpace: 'nowrap',
                                            }}>{sc.label}</span>

                                            {/* Calificación */}
                                            <span style={{
                                                background: rc.bg, color: rc.color,
                                                border: `1px solid ${rc.border}`,
                                                padding: '0.22rem 0.6rem', borderRadius: '8px',
                                                fontSize: '0.73rem', fontWeight: '700',
                                                display: 'inline-block', whiteSpace: 'nowrap',
                                            }}>{client.rating}</span>

                                            {/* Ver transcripción */}
                                            <button
                                                onClick={() => setViewingTranscription(client)}
                                                style={{
                                                    background: '#fff7ed', border: '1px solid #fed7aa',
                                                    borderRadius: '8px', padding: '0.28rem 0.55rem',
                                                    cursor: 'pointer', fontSize: '0.73rem',
                                                    color: '#c2410c', fontWeight: '600',
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                                    transition: 'all 0.15s', whiteSpace: 'nowrap',
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#c2410c'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = '#c2410c'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.color = '#c2410c'; e.currentTarget.style.borderColor = '#fed7aa'; }}
                                            >
                                                💬 Ver
                                            </button>

                                            {/* Rating buttons */}
                                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                                {RATINGS.map(r => {
                                                    const rcb = RATING_CFG[r];
                                                    const active = client.rating === r;
                                                    return (
                                                        <button key={r} onClick={() => handleRatingChange(client.id, r)} style={{
                                                            padding: '0.22rem 0.5rem',
                                                            fontSize: '0.68rem', fontWeight: active ? '700' : '500',
                                                            borderRadius: '6px',
                                                            border: `1px solid ${active ? rcb.border : '#e2e8f0'}`,
                                                            background: active ? rcb.bg : 'white',
                                                            color: active ? rcb.color : '#94a3b8',
                                                            cursor: 'pointer', transition: 'all 0.12s',
                                                            boxShadow: active ? `0 1px 4px ${rcb.border}60` : 'none',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                            onMouseEnter={e => { if (!active) { e.currentTarget.style.background = rcb.bg; e.currentTarget.style.color = rcb.color; e.currentTarget.style.borderColor = rcb.border; } }}
                                                            onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#e2e8f0'; } }}
                                                        >{r}</button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📭</div>
                                        <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600', color: '#64748b' }}>Sin registros para los filtros seleccionados</p>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>{/* /content */}
                </div>
            </div>

            {/* ── TRANSCRIPTION SUB-MODAL ── */}
            {viewingTranscription && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(15,23,42,0.8)',
                    zIndex: 1400,
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    padding: '1rem',
                    backdropFilter: 'blur(4px)',
                }} onClick={() => setViewingTranscription(null)}>
                    <div style={{
                        background: 'white', borderRadius: '16px',
                        width: '100%', maxWidth: '680px', maxHeight: '86vh', overflowY: 'auto',
                        boxShadow: '0 32px 64px rgba(0,0,0,0.45)',
                        animation: 'cliModalIn 0.18s ease-out',
                    }} onClick={e => e.stopPropagation()}>

                        {/* Sub-header */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid #e2e8f0',
                            background: '#f8fafc',
                            borderRadius: '16px 16px 0 0',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                                    <span style={{
                                        fontFamily: "'Courier New',monospace",
                                        fontWeight: '700', color: '#1e40af', fontSize: '1rem',
                                        background: '#eff6ff', padding: '0.15rem 0.45rem',
                                        borderRadius: '5px', border: '1px solid #bfdbfe',
                                    }}>
                                        {viewingTranscription.id}
                                    </span>
                                    <span style={{
                                        background: RATING_CFG[viewingTranscription.rating]?.bg,
                                        color: RATING_CFG[viewingTranscription.rating]?.color,
                                        border: `1px solid ${RATING_CFG[viewingTranscription.rating]?.border}`,
                                        padding: '0.18rem 0.6rem', borderRadius: '6px',
                                        fontSize: '0.76rem', fontWeight: '700',
                                    }}>
                                        {viewingTranscription.rating}
                                    </span>
                                    <span style={{
                                        background: SENTIMENT_CFG[viewingTranscription.sentiment]?.bg,
                                        color: SENTIMENT_CFG[viewingTranscription.sentiment]?.color,
                                        padding: '0.18rem 0.6rem', borderRadius: '6px',
                                        fontSize: '0.76rem', fontWeight: '700',
                                    }}>
                                        {viewingTranscription.sentiment}
                                    </span>
                                </div>
                                <p style={{ color: '#94a3b8', fontSize: '0.78rem', margin: 0 }}>
                                    {viewingTranscription.fecha} &nbsp;·&nbsp; {viewingTranscription.hora} &nbsp;·&nbsp; {viewingTranscription.duracion} min
                                </p>
                            </div>
                            <button onClick={() => setViewingTranscription(null)} style={{
                                background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px',
                                padding: '0.3rem 0.55rem', cursor: 'pointer', color: '#64748b', fontSize: '0.9rem',
                                transition: 'all 0.12s',
                            }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#991b1b'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#64748b'; }}
                            >✕</button>
                        </div>

                        {/* Transcript body */}
                        <div style={{ padding: '1.5rem' }}>
                            <p style={{ fontSize: '0.72rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
                                Transcripción de la atención
                            </p>
                            <div style={{
                                background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0',
                                padding: '1.25rem 1.5rem',
                                fontFamily: "'Courier New',monospace",
                                fontSize: '0.84rem', lineHeight: '1.9',
                                color: '#334155', whiteSpace: 'pre-line',
                            }}>
                                {viewingTranscription.transcripcion}
                            </div>
                            <div style={{ textAlign: 'right', marginTop: '1.25rem' }}>
                                <button onClick={() => setViewingTranscription(null)} style={{
                                    background: '#1e40af', color: 'white', border: 'none',
                                    borderRadius: '9px', padding: '0.6rem 1.6rem',
                                    cursor: 'pointer', fontWeight: '600', fontSize: '0.88rem',
                                    boxShadow: '0 2px 8px rgba(30,64,175,0.35)',
                                    transition: 'background 0.15s',
                                }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#1e40af'}
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes cliModalIn {
                    from { opacity:0; transform:translateY(18px) scale(0.97); }
                    to   { opacity:1; transform:translateY(0)     scale(1);    }
                }
            `}</style>
        </>
    );
}
