import React, { useState, useMemo, useEffect } from 'react';
import { getEcuadorDateString, getEcuadorTimeString } from '../../utils/date';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    PieChart, Pie, Cell,
} from 'recharts';
import { getGrabacionesByUsuario, getTranscripciones, getAnalisis } from '../../api/grabaciones';

// ─── parser: extracts dynamic metrics from respuestas and summary from resumen_ejecutivo ────────────
function extractSummary(resumen) {
    if (!resumen) return '';
    const firstLineEnd = resumen.indexOf('\n');
    if (firstLineEnd === -1) {
        return resumen.includes('|') && resumen.includes('=') ? '' : resumen;
    }
    return resumen.substring(firstLineEnd + 1).trim();
}

function buildMetricsFromRespuestas(respuestas) {
    if (!respuestas || !Array.isArray(respuestas)) return [];
    
    return respuestas.map((r, i) => {
        const preg = r.pregunta || {};
        const config = preg.configuracion_respuesta || {};
        const isNumeric = preg.tipo_respuesta === 'ESCALA_NUMERICA';
        
        let explicitoMatch = null;
        if (r.justificacion_ia) {
            if (r.justificacion_ia.includes('Explicito=True')) explicitoMatch = true;
            else if (r.justificacion_ia.includes('Explicito=False')) explicitoMatch = false;
        }

        let val;
        let max = null;
        if (isNumeric) {
            val = r.puntaje_obtenido != null ? Number(r.puntaje_obtenido) : 0;
            max = config.max || 10;
        } else {
            val = r.respuesta_booleana ? "Sí" : "No";
        }

        const name = preg.texto_pregunta || `Métrica ${i+1}`;
        
        return {
            name,
            value: val,
            max,
            explicito: explicitoMatch,
            isNumeric
        };
    });
}


// ─── MetricasBody: renders metrics cards + resumen text ────────────────
function MetricasBody({ analisis }) {
    const metrics = buildMetricsFromRespuestas(analisis.respuestas);
    const summary = extractSummary(analisis.resumen_ejecutivo);
    const cal = analisis.calificacion_general;
    const calNum = cal != null ? Number(cal) : null;
    const calColor = calNum == null ? '#94a3b8' : calNum >= 7 ? '#059669' : calNum >= 4 ? '#d97706' : '#dc2626';

    return (
        <>
            {/* Metric cards row */}
            {metrics.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${metrics.length + 1}, 1fr)`, gap: '0.8rem', marginBottom: '1.25rem' }}>
                    {metrics.map((m, i) => {
                        let color, bg, border, displayVal;
                        let pct = 0;

                        if (m.isNumeric) {
                            pct = m.max > 0 ? (m.value / m.max) * 100 : 0;
                            color = pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#dc2626';
                            bg = pct >= 70 ? '#ecfdf5' : pct >= 40 ? '#fffbeb' : '#fef2f2';
                            border = pct >= 70 ? '#6ee7b7' : pct >= 40 ? '#fcd34d' : '#fca5a5';
                            displayVal = m.value;
                        } else {
                            color = '#4f46e5';
                            bg = '#eef2ff';
                            border = '#a5b4fc';
                            displayVal = m.value;
                        }

                        let metaKey = m.name.length > 3 ? m.name.substring(0, 3).toUpperCase() : m.name;
                        const meta = { label: m.name.length > 25 ? m.name.substring(0, 22) + '...' : m.name, icon: '📊', grad: 'linear-gradient(135deg,#6366f1,#8b5cf6)' };

                        return (
                            <div key={m.name} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: '14px', padding: '1rem', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: meta.grad, borderRadius: '14px 14px 0 0' }} />

                                {m.isNumeric ? (
                                    <>
                                        <div style={{ fontSize: '1.4rem', marginBottom: '0.3rem' }}>{meta.icon}</div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.08em', color, marginBottom: '0.25rem' }}>{metaKey}</div>
                                        <div style={{ fontSize: '1.8rem', fontWeight: '800', color, lineHeight: 1 }}>{m.value}</div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>/ {m.max} · {meta.label}</div>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '44px', marginBottom: '0.3rem', fontSize: '2rem' }}>
                                            {meta.icon}
                                        </div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.08em', color, marginBottom: '0.25rem' }}>{metaKey}</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: '800', color, marginBottom: '0.5rem', padding: '0 0.2rem', lineHeight: 1.1 }}>
                                            {String(m.value)}
                                        </div>
                                    </>
                                )}

                                {m.explicito !== null && (
                                    <span style={{ display: 'inline-block', marginTop: m.isNumeric ? '0.4rem' : '0.1rem', background: m.explicito ? '#dbeafe' : '#f3f4f6', color: m.explicito ? '#1d4ed8' : '#6b7280', border: `1px solid ${m.explicito ? '#93c5fd' : '#d1d5db'}`, borderRadius: '99px', fontSize: '0.6rem', fontWeight: '700', padding: '0.1rem 0.45rem' }}>
                                        {m.explicito ? '✦ Explícito' : '○ Implícito'}
                                    </span>
                                )}

                                {m.isNumeric && (
                                    <div style={{ marginTop: '0.5rem', height: '5px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                                        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.8s ease' }} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {/* Calificación General card */}
                    <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '1rem', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(135deg,#b45309,#d97706)', borderRadius: '14px 14px 0 0' }} />
                        <div style={{ fontSize: '1.4rem', marginBottom: '0.3rem' }}>⭐</div>
                        <div style={{ fontSize: '0.6rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#b45309', marginBottom: '0.25rem' }}>CALIFICACIÓN</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '800', color: calColor, lineHeight: 1 }}>{calNum != null ? calNum.toFixed(1) : '—'}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>/ 10 · Calificación General</div>
                        {calNum != null && (
                            <div style={{ marginTop: '0.5rem', height: '5px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                                <div style={{ width: `${(calNum / 10) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#b45309,#d97706)', borderRadius: '99px', transition: 'width 0.8s ease' }} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Solo calificación si no hay métricas */}
            {metrics.length === 0 && calNum != null && (
                <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'inline-block', background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: '14px', padding: '1rem 2rem' }}>
                        <div style={{ fontSize: '1.1rem' }}>⭐</div>
                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Calificación</div>
                        <div style={{ fontSize: '2rem', fontWeight: '800', color: calColor }}>{calNum.toFixed(1)}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>/ 10</div>
                    </div>
                </div>
            )}

            {/* Resumen ejecutivo text */}
            {(summary || analisis.resumen_ejecutivo) && (
                <div style={{ background: '#fffbf5', border: '1.5px solid #fed7aa', borderRadius: '14px', padding: '1.1rem 1.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
                        <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: 'linear-gradient(135deg,#b45309,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>📋</div>
                        <span style={{ fontWeight: '800', fontSize: '0.85rem', color: '#92400e' }}>Resumen Ejecutivo</span>
                        {analisis.sentimiento_general && (
                            <span style={{ marginLeft: 'auto', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '99px', fontSize: '0.68rem', fontWeight: '700', padding: '0.15rem 0.6rem' }}>
                                {analisis.sentimiento_general}
                            </span>
                        )}
                    </div>
                    <p style={{ margin: 0, color: '#334155', fontSize: '0.85rem', lineHeight: '1.7', borderLeft: '3px solid #fed7aa', paddingLeft: '0.75rem' }}>
                        {summary || analisis.resumen_ejecutivo}
                    </p>
                </div>
            )}

            {/* Fallback: no data at all */}
            {metrics.length === 0 && !summary && !analisis.resumen_ejecutivo && calNum == null && (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem' }}>No hay datos de análisis disponibles para esta grabación.</p>
                </div>
            )}
        </>
    );
}

// ─── helpers ──────────────────────────────────────────────────────────────────
const SENTIMENT_CFG = {
    Positivo: { bg: '#dcfce7', color: '#15803d', dot: '#4ade80' },
    Neutral: { bg: '#fef3c7', color: '#92400e', dot: '#fbbf24' },
    Negativo: { bg: '#fee2e2', color: '#991b1b', dot: '#f87171' },
};

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem 1rem', boxShadow: '0 6px 20px rgba(0,0,0,0.1)' }}>
            <p style={{ margin: '0 0 0.3rem', fontWeight: '700', color: '#0f172a', fontSize: '0.8rem' }}>{label}</p>
            {payload.map(p => <p key={p.dataKey} style={{ margin: 0, fontSize: '0.78rem', color: '#b45309', fontWeight: '700' }}>Score: {p.value}%</p>)}
        </div>
    );
};

// ─── main component ────────────────────────────────────────────────────────────
export default function CashierDetailModal({ cashier, onClose }) {
    const [filterPeriod, setFilterPeriod] = useState('month');
    const [customDates, setCustomDates] = useState({ start: '', end: '' });
    const [selectedMetrics, setSelectedMetrics] = useState(null);
    const [metricsAnalisis, setMetricsAnalisis] = useState(null);
    const [metricsAnalisisLoading, setMetricsAnalisisLoading] = useState(false);
    const [realRecordings, setRealRecordings] = useState([]);
    const [isLoadingRecordings, setIsLoadingRecordings] = useState(false);

    const [selectedRecordingTranscription, setSelectedRecordingTranscription] = useState(null);
    const [transcriptionData, setTranscriptionData] = useState(null);
    const [isTranscriptionLoading, setIsTranscriptionLoading] = useState(false);

    useEffect(() => {
        if (!cashier?.id) return;
        const fetchRecs = async () => {
            setIsLoadingRecordings(true);
            try {
                const data = await getGrabacionesByUsuario(cashier.id);
                // Map the backend data to match the UI requirements
                const mapped = data.map((rec) => {
                    const durSecs = ((new Date(rec.fecha_hora_fin) - new Date(rec.fecha_hora_inicio)) / 1000);
                    return {
                        rawId: rec.id, // Full UUID
                        id: rec.id.split('-')[0], // Short visual ID
                        date: getEcuadorDateString(rec.fecha_hora_inicio),
                        time: getEcuadorTimeString(rec.fecha_hora_inicio),
                        durationSecs: durSecs,
                        duration: durSecs > 0 ? new Date((new Date(rec.fecha_hora_fin) - new Date(rec.fecha_hora_inicio))).toISOString().slice(14, 19) : "00:00",
                        sentiment: rec.analisis?.sentimiento_general || 'Neutral',
                        calificacion: rec.analisis?.calificacion_general,
                        analisisData: rec.analisis || null,
                        transcripcion: rec.transcripcion || ""
                    };
                });
                // Sort by newest first
                mapped.sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time))
                setRealRecordings(mapped);
            } catch (err) {
                console.error("Failed to load recordings for cashier", err);
            } finally {
                setIsLoadingRecordings(false);
            }
        };

        fetchRecs();
    }, [cashier]);

    useEffect(() => {
        if (selectedRecordingTranscription) {
            const fetchTranscripciones = async () => {
                setIsTranscriptionLoading(true);
                try {
                    const data = await getTranscripciones(selectedRecordingTranscription.rawId);
                    setTranscriptionData(data);
                } catch (error) {
                    console.error("Error fetching transcription:", error);
                    setTranscriptionData(null);
                } finally {
                    setIsTranscriptionLoading(false);
                }
            };
            fetchTranscripciones();
        } else {
            setTranscriptionData(null);
        }
    }, [selectedRecordingTranscription]);

    const filteredRecordings = useMemo(() => {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        return realRecordings.filter(rec => {
            if (filterPeriod === 'today') return rec.date === todayStr;
            if (filterPeriod === 'yesterday') return rec.date === yesterdayStr;
            if (filterPeriod === 'month') { const mo = new Date(now); mo.setMonth(mo.getMonth() - 1); return new Date(rec.date) >= mo; }
            if (filterPeriod === 'custom' && customDates.start && customDates.end) return rec.date >= customDates.start && rec.date <= customDates.end;
            return true;
        });
    }, [filterPeriod, customDates, realRecordings]);

    // Calculate global stats from filteredRecordings
    const { 
        totalGrabaciones, avgSentiment, avgDurationStr, avgCumplimiento, metricsData 
    } = useMemo(() => {
        const total = filteredRecordings.length;
        let sumSentiment = 0;
        let sentimentCount = 0;
        let sumDurationSecs = 0;
        
        const skillTotals = {};
        let totalCumpSum = 0;
        let totalCumpCount = 0;

        filteredRecordings.forEach(rec => {
            if (rec.calificacion != null && !isNaN(rec.calificacion)) {
                sumSentiment += Number(rec.calificacion);
                sentimentCount++;
            }
            if (rec.durationSecs && !isNaN(rec.durationSecs)) {
                sumDurationSecs += rec.durationSecs;
            }
            
            if (rec.analisisData && rec.analisisData.respuestas) {
                let recScoreSum = 0;
                let recScoreMax = 0;
                rec.analisisData.respuestas.forEach((r, i) => {
                    if (r.pregunta?.tipo_respuesta === 'ESCALA_NUMERICA') {
                        const max = r.pregunta?.configuracion_respuesta?.max || 10;
                        let val = r.puntaje_obtenido != null ? Number(r.puntaje_obtenido) : 0;
                        recScoreSum += val;
                        recScoreMax += max;
                        const name = r.pregunta?.texto_pregunta || `Métrica ${i+1}`;
                        if (!skillTotals[name]) skillTotals[name] = { sum: 0, maxSum: 0 };
                        skillTotals[name].sum += val;
                        skillTotals[name].maxSum += max;
                    }
                });
                if (recScoreMax > 0) {
                    totalCumpSum += (recScoreSum / recScoreMax) * 100;
                    totalCumpCount++;
                }
            }
        });

        const avgS = sentimentCount > 0 ? (sumSentiment / sentimentCount).toFixed(1) : '0.0';
        const avgDur = total > 0 ? sumDurationSecs / total : 0;
        const min = Math.floor(avgDur / 60);
        const sec = Math.floor(avgDur % 60);
        const avgDurStr = avgDur > 0 ? `${min}m ${sec}s` : '0m 0s';
        const avgCump = totalCumpCount > 0 ? Math.round(totalCumpSum / totalCumpCount) : 0;

        const mData = Object.keys(skillTotals).map(key => {
            const st = skillTotals[key];
            const pct = st.maxSum > 0 ? Math.round((st.sum / st.maxSum) * 100) : 0;
            const shortName = key.length > 15 ? key.substring(0, 15) + '...' : key;
            return { subject: shortName, A: pct };
        });
        if (mData.length === 0) {
            mData.push({ subject: 'Sin datos', A: 0 });
        }

        return {
            totalGrabaciones: total,
            avgSentiment: avgS,
            avgDurationStr: avgDurStr,
            avgCumplimiento: avgCump,
            metricsData: mData
        };
    }, [filteredRecordings]);

    const performanceTrend = useMemo(() => {
        const trend = {};
        filteredRecordings.forEach(rec => {
            const dateStr = rec.date;
            if (!trend[dateStr]) trend[dateStr] = { sum: 0, count: 0 };
            const score = rec.calificacion != null ? (rec.calificacion * 10) : (rec.sentiment === 'Positivo' ? 90 : rec.sentiment === 'Negativo' ? 60 : 75);
            trend[dateStr].sum += score;
            trend[dateStr].count += 1;
        });

        const sortedDates = Object.keys(trend).sort((a, b) => new Date(a) - new Date(b));
        
        return sortedDates.map(dateStr => {
            const d = new Date(dateStr);
            d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
            const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' });
            return {
                day: dayName.charAt(0).toUpperCase() + dayName.slice(1),
                score: Math.round(trend[dateStr].sum / trend[dateStr].count)
            };
        }).slice(-7);
    }, [filteredRecordings]);

    const cashierName = cashier?.username || 'Cajero';
    const initials = cashierName.slice(0, 2).toUpperCase();

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.65)', display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1100, backdropFilter: 'blur(6px)', padding: '1rem',
        }}>
            <div style={{
                background: '#f8fafc', borderRadius: '24px',
                width: '100%', maxWidth: '1060px', height: '92vh',
                boxShadow: '0 32px 80px -16px rgba(15,23,42,0.38)',
                animation: 'detailIn 0.24s cubic-bezier(0.34,1.56,0.64,1)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
                <style>{`
                    @keyframes detailIn {
                        from { opacity:0; transform:translateY(24px) scale(0.97); }
                        to   { opacity:1; transform:translateY(0) scale(1); }
                    }
                    @keyframes statFadeIn {
                        from { opacity:0; transform:translateY(10px); }
                        to   { opacity:1; transform:translateY(0); }
                    }
                    @keyframes recRowIn {
                        from { opacity:0; transform:translateX(-6px); }
                        to   { opacity:1; transform:translateX(0); }
                    }
                    .rec-row:hover { background: #fff7ed !important; }
                    .rec-row:hover .rec-accent { opacity:1 !important; }
                    .filter-pill:hover { border-color: #b45309 !important; color: #b45309 !important; }
                `}</style>

                {/* ── HEADER ── */}
                <div style={{
                    padding: '1.5rem 2rem',
                    background: 'linear-gradient(130deg, #92400e 0%, #b45309 55%, #d97706 100%)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    flexShrink: 0, position: 'relative', overflow: 'hidden',
                }}>
                    <div style={{ position: 'absolute', right: '-40px', top: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', right: '80px', bottom: '-60px', width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', zIndex: 1 }}>
                        {/* Avatar */}
                        <div style={{
                            width: '52px', height: '52px', borderRadius: '15px',
                            background: 'rgba(255,255,255,0.18)',
                            border: '2px solid rgba(255,255,255,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontWeight: '800', fontSize: '1.15rem', letterSpacing: '-0.01em',
                        }}>{initials}</div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.2rem' }}>
                                <h2 style={{ margin: 0, color: 'white', fontWeight: '800', fontSize: '1.35rem', letterSpacing: '-0.025em' }}>
                                    {cashierName}
                                </h2>
                                <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.62rem', fontWeight: '700', padding: '0.12rem 0.5rem', borderRadius: '99px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>● Activo</span>
                            </div>
                            <p style={{ margin: 0, color: '#fde68a', fontSize: '0.82rem', fontWeight: '400' }}>
                                Análisis de Desempeño · Perfil de calidad y métricas
                            </p>
                        </div>
                    </div>

                    <button onClick={onClose} style={{
                        zIndex: 1, background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.22)',
                        borderRadius: '10px', padding: '0.4rem 0.75rem', cursor: 'pointer',
                        color: 'white', fontSize: '1rem', transition: 'all 0.15s',
                    }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.24)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.13)'}
                    >✕</button>
                </div>

                {/* ── SCROLLABLE CONTENT ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.6rem 2rem' }}>

                    {/* STAT CARDS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                        {[
                            { icon: '🎙️', label: 'Grabaciones', value: totalGrabaciones, sub: 'Total registradas', bg: '#fff7ed', border: '#fed7aa', val: '#b45309', sub_c: '#92400e' },
                            { icon: '😊', label: 'Sentimiento', value: `${avgSentiment}/10`, sub: 'Promedio general', bg: '#ecfdf5', border: '#bbf7d0', val: '#059669', sub_c: '#065f46' },
                            { icon: '✅', label: 'Cumplimiento', value: `${avgCumplimiento}%`, sub: 'Métricas clave', bg: '#f0f9ff', border: '#bae6fd', val: '#0369a1', sub_c: '#0284c7' },
                            { icon: '⏱️', label: 'Tiempo promedio', value: avgDurationStr, sub: 'Por atención', bg: '#f5f3ff', border: '#ddd6fe', val: '#6d28d9', sub_c: '#7c3aed' },
                        ].map((s, i) => (
                            <div key={s.label} style={{
                                background: s.bg, border: `1px solid ${s.border}`,
                                borderRadius: '16px', padding: '1.1rem 1.25rem',
                                animation: `statFadeIn 0.35s ease ${i * 0.07}s both`,
                            }}>
                                <div style={{ fontSize: '1.4rem', marginBottom: '0.35rem' }}>{s.icon}</div>
                                <p style={{ margin: 0, fontSize: '0.65rem', fontWeight: '700', color: s.sub_c, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
                                <p style={{ margin: '0.25rem 0 0.15rem', fontSize: '1.9rem', fontWeight: '800', color: s.val, lineHeight: 1 }}>{s.value}</p>
                                <p style={{ margin: 0, fontSize: '0.73rem', color: s.sub_c, fontWeight: '400' }}>{s.sub}</p>
                            </div>
                        ))}
                    </div>

                    {/* CHARTS ROW */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                        {/* Line chart */}
                        <div style={{ background: 'white', borderRadius: '18px', border: '1px solid #f1f5f9', padding: '1.25rem', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                            <p style={{ margin: '0 0 0.15rem', fontWeight: '700', fontSize: '0.9rem', color: '#1e293b' }}>Tendencia de Rendimiento</p>
                            <p style={{ margin: '0 0 1rem', fontSize: '0.72rem', color: '#94a3b8' }}>Score semanal de desempeño</p>
                            <div style={{ height: 200 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={performanceTrend.length > 0 ? performanceTrend : [{day: 'Lun', score: 0}]} margin={{ top: 4, right: 12, left: -20, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                        <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                        <RechartsTooltip content={<CustomTooltip />} />
                                        <Line type="monotone" dataKey="score" stroke="#b45309" strokeWidth={2.5}
                                            dot={{ r: 4, fill: '#b45309', stroke: 'white', strokeWidth: 2 }}
                                            activeDot={{ r: 6, fill: '#d97706' }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Radar chart */}
                        <div style={{ background: 'white', borderRadius: '18px', border: '1px solid #f1f5f9', padding: '1.25rem', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                            <p style={{ margin: '0 0 0.15rem', fontWeight: '700', fontSize: '0.9rem', color: '#1e293b' }}>Perfil de Habilidades</p>
                            <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', color: '#94a3b8' }}>Competencias del cajero</p>
                            <div style={{ height: 200 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="72%" data={metricsData}>
                                        <PolarGrid stroke="#f1f5f9" />
                                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                        <Radar name="Cajero" dataKey="A" stroke="#b45309" fill="#d97706" fillOpacity={0.25} strokeWidth={2} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* RECORDINGS TABLE */}
                    <div style={{ background: 'white', borderRadius: '18px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                        {/* Table header */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            background: 'linear-gradient(130deg, #92400e 0%, #b45309 55%, #d97706 100%)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <span style={{ fontSize: '1rem' }}>🎙️</span>
                                <span style={{ color: 'white', fontWeight: '700', fontSize: '0.95rem' }}>Grabaciones Recientes</span>
                            </div>
                            {/* Filter pills */}
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                {[
                                    { id: 'today', label: 'Hoy' },
                                    { id: 'yesterday', label: 'Ayer' },
                                    { id: 'month', label: 'Mes' },
                                    { id: 'custom', label: 'Rango' },
                                ].map(p => {
                                    const active = filterPeriod === p.id;
                                    return (
                                        <button key={p.id} onClick={() => setFilterPeriod(p.id)} className="filter-pill" style={{
                                            padding: '0.3rem 0.75rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: active ? '700' : '500',
                                            border: `1.5px solid ${active ? 'white' : 'rgba(255,255,255,0.4)'}`,
                                            background: active ? 'rgba(255,255,255,0.22)' : 'transparent',
                                            color: 'white', cursor: 'pointer', transition: 'all 0.15s',
                                        }}>{p.label}</button>
                                    );
                                })}
                                <span style={{
                                    background: 'rgba(255,255,255,0.15)', color: 'white',
                                    borderRadius: '20px', padding: '0.2rem 0.75rem',
                                    fontSize: '0.73rem', fontWeight: '700', border: '1px solid rgba(255,255,255,0.22)',
                                }}>{filteredRecordings.length} registros</span>
                            </div>
                        </div>

                        {/* Custom date row */}
                        {filterPeriod === 'custom' && (
                            <div style={{ padding: '0.65rem 1.5rem', background: '#fff7ed', borderBottom: '1px solid #fed7aa', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.77rem', color: '#92400e', fontWeight: '600' }}>Desde</span>
                                <input type="date" value={customDates.start} onChange={e => setCustomDates({ ...customDates, start: e.target.value })} style={{ padding: '0.3rem 0.5rem', borderRadius: '7px', border: '1px solid #fed7aa', fontSize: '0.8rem', fontFamily: 'inherit', outline: 'none' }} />
                                <span style={{ fontSize: '0.77rem', color: '#92400e', fontWeight: '600' }}>hasta</span>
                                <input type="date" value={customDates.end} onChange={e => setCustomDates({ ...customDates, end: e.target.value })} style={{ padding: '0.3rem 0.5rem', borderRadius: '7px', border: '1px solid #fed7aa', fontSize: '0.8rem', fontFamily: 'inherit', outline: 'none' }} />
                            </div>
                        )}

                        {/* Column headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, 1fr) 120px 80px 100px 160px', padding: '0.55rem 1.4rem', background: '#fafafa', borderBottom: '1px solid #f1f5f9', gap: '0.5rem' }}>
                            {['ID', 'Fecha / Hora', 'Duración', 'Sentimiento', 'Acciones'].map(h => (
                                <span key={h} style={{ fontSize: '0.63rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
                            ))}
                        </div>

                        {/* Rows */}
                        <div>
                            {isLoadingRecordings ? (
                                <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                    Cargando grabaciones...
                                </div>
                            ) : filteredRecordings.length > 0 ? filteredRecordings.map((rec, idx) => {
                                const sc = SENTIMENT_CFG[rec.sentiment] ?? SENTIMENT_CFG.Neutral;
                                return (
                                    <div key={rec.id} className="rec-row" style={{
                                        display: 'grid', gridTemplateColumns: 'minmax(80px, 1fr) 120px 80px 100px 160px',
                                        alignItems: 'center', padding: '0.7rem 1.4rem', gap: '0.5rem',
                                        borderBottom: '1px solid #f8fafc',
                                        background: idx % 2 === 0 ? 'white' : '#fafafa',
                                        transition: 'background 0.15s',
                                        animation: `recRowIn 0.3s ease ${idx * 0.025}s both`,
                                        position: 'relative',
                                    }}>
                                        <div className="rec-accent" style={{ position: 'absolute', left: 0, top: '18%', bottom: '18%', width: '3px', borderRadius: '4px', background: '#f97316', opacity: 0, transition: 'opacity 0.2s' }} />

                                        {/* ID */}
                                        <span style={{ fontFamily: "'Courier New', monospace", fontWeight: '700', color: '#92400e', fontSize: '0.78rem', background: '#fff7ed', padding: '0.18rem 0.45rem', borderRadius: '6px', border: '1px solid #fed7aa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rec.id}</span>

                                        {/* Fecha/hora */}
                                        <span style={{ fontSize: '0.8rem', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{rec.date} · {rec.time}</span>

                                        {/* Duración */}
                                        <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{rec.duration}</span>

                                        {/* Sentimiento */}
                                        <span style={{ background: sc.bg, color: sc.color, padding: '0.22rem 0.6rem', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap', width: 'fit-content' }}>
                                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sc.dot, display: 'inline-block' }} />
                                            {rec.sentiment}
                                        </span>

                                        {/* Botones / Acciones */}
                                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                                            <button onClick={() => setSelectedRecordingTranscription(rec)} style={{
                                                background: '#f0fdf4', border: '1px solid #bbf7d0',
                                                borderRadius: '8px', padding: '0.3rem 0.55rem',
                                                cursor: 'pointer', fontSize: '0.73rem', color: '#166534', fontWeight: '600',
                                                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                                transition: 'all 0.15s', whiteSpace: 'nowrap',
                                            }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#166534'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = '#166534'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = '#f0fdf4'; e.currentTarget.style.color = '#166534'; e.currentTarget.style.borderColor = '#bbf7d0'; }}
                                            >📝 Transcr.</button>

                                            <button onClick={async () => {
                                                setSelectedMetrics(rec);
                                                // If analisis is already embedded in the recording, use it directly
                                                if (rec.analisisData) {
                                                    setMetricsAnalisis(rec.analisisData);
                                                    setMetricsAnalisisLoading(false);
                                                } else {
                                                    setMetricsAnalisis(null);
                                                    setMetricsAnalisisLoading(true);
                                                    try {
                                                        const a = await getAnalisis(rec.rawId);
                                                        setMetricsAnalisis(a);
                                                    } catch (err) {
                                                        console.error('Error loading analisis:', err);
                                                        setMetricsAnalisis(null);
                                                    } finally {
                                                        setMetricsAnalisisLoading(false);
                                                    }
                                                }
                                            }} style={{
                                                background: '#fff7ed', border: '1px solid #fed7aa',
                                                borderRadius: '8px', padding: '0.3rem 0.55rem',
                                                cursor: 'pointer', fontSize: '0.73rem', color: '#b45309', fontWeight: '600',
                                                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                                transition: 'all 0.15s', whiteSpace: 'nowrap',
                                            }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#b45309'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = '#b45309'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.color = '#b45309'; e.currentTarget.style.borderColor = '#fed7aa'; }}
                                            >📋 Métricas</button>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📭</div>
                                    <p style={{ margin: 0, fontWeight: '600', color: '#64748b' }}>No hay grabaciones en este período</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── METRICS POPUP ── */}
            {selectedMetrics && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(15,23,42,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 1300, backdropFilter: 'blur(4px)', padding: '1rem',
                }}>
                    <div style={{
                        background: 'white', borderRadius: '20px',
                        width: '100%', maxWidth: '820px', maxHeight: '88vh', overflowY: 'auto',
                        boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
                        animation: 'detailIn 0.2s ease',
                    }}>
                        {/* Popup header */}
                        <div style={{
                            padding: '1.25rem 1.75rem',
                            background: 'linear-gradient(130deg, #92400e 0%, #b45309 55%, #d97706 100%)',
                            borderRadius: '20px 20px 0 0',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <div>
                                <span style={{ color: 'white', fontWeight: '800', fontSize: '1rem' }}>📋 Detalle de Métricas</span>
                                <span style={{ marginLeft: '0.6rem', background: 'rgba(255,255,255,0.18)', color: 'white', borderRadius: '20px', padding: '0.18rem 0.7rem', fontSize: '0.73rem', fontWeight: '700', border: '1px solid rgba(255,255,255,0.25)' }}>{selectedMetrics.id}</span>
                            </div>
                            <button onClick={() => setSelectedMetrics(null)} style={{ background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: '9px', padding: '0.35rem 0.65rem', cursor: 'pointer', color: 'white', fontSize: '0.95rem', transition: 'all 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.24)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.13)'}
                            >✕</button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '1.75rem' }}>
                            {metricsAnalisisLoading ? (
                                <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⏳</div>
                                    <p style={{ margin: 0, fontWeight: '600', fontSize: '0.9rem' }}>Cargando análisis...</p>
                                </div>
                            ) : metricsAnalisis ? (
                                <MetricasBody analisis={metricsAnalisis} />
                            ) : (
                                <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                                    No hay datos de análisis disponibles para esta grabación.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── TRANSCRIPTION POPUP ── */}
            {selectedRecordingTranscription && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(15,23,42,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 1300, backdropFilter: 'blur(4px)', padding: '1rem',
                }}>
                    <div style={{
                        background: 'white', borderRadius: '20px',
                        width: '100%', maxWidth: '750px', maxHeight: '88vh', overflowY: 'auto',
                        boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
                        animation: 'detailIn 0.2s ease', display: 'flex', flexDirection: 'column'
                    }}>
                        <div style={{
                            padding: '1.25rem 1.75rem',
                            background: 'linear-gradient(130deg, #166534 0%, #15803d 55%, #22c55e 100%)',
                            borderRadius: '20px 20px 0 0',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            flexShrink: 0
                        }}>
                            <div>
                                <span style={{ color: 'white', fontWeight: '800', fontSize: '1rem' }}>📝 Transcripción</span>
                                <span style={{ marginLeft: '0.6rem', background: 'rgba(255,255,255,0.18)', color: 'white', borderRadius: '20px', padding: '0.18rem 0.7rem', fontSize: '0.73rem', fontWeight: '700', border: '1px solid rgba(255,255,255,0.25)' }}>{selectedRecordingTranscription.id}</span>
                            </div>
                            <button onClick={() => setSelectedRecordingTranscription(null)} style={{ background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: '9px', padding: '0.35rem 0.65rem', cursor: 'pointer', color: 'white', fontSize: '0.95rem', transition: 'all 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.24)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.13)'}
                            >✕</button>
                        </div>
                        <div style={{ padding: '1.75rem', flex: 1, overflowY: 'auto' }}>
                            {isTranscriptionLoading ? (
                                <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⏳</div>
                                    <p style={{ margin: 0, fontWeight: '600', fontSize: '0.9rem' }}>Cargando transcripción...</p>
                                </div>
                            ) : transcriptionData && transcriptionData.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    {transcriptionData.flatMap(t => t.segmentos || []).map((t, idx) => {
                                        const isCustomer = t.speaker?.toLowerCase().includes('cliente') || t.speaker?.toLowerCase().includes('speaker 0') || t.speaker === '0';
                                        return (
                                            <div key={idx} style={{
                                                background: isCustomer ? '#f8fafc' : '#f0fdf4',
                                                border: `1px solid ${isCustomer ? '#e2e8f0' : '#bbf7d0'}`,
                                                borderRadius: '12px', padding: '1rem',
                                                alignSelf: isCustomer ? 'flex-start' : 'flex-end',
                                                maxWidth: '85%'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem', gap: '1rem' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: isCustomer ? '#64748b' : '#166534', textTransform: 'uppercase' }}>
                                                        {isCustomer ? '👤 Cliente' : '👨‍💼 Cajero'}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                                                        {t.start_time.slice(0, 8)}
                                                    </span>
                                                </div>
                                                <p style={{ margin: 0, color: '#334155', fontSize: '0.9rem', lineHeight: '1.5' }}>
                                                    {t.text}
                                                </p>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : selectedRecordingTranscription.transcripcion ? (
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', whiteSpace: 'pre-wrap', color: '#334155', fontSize: '0.9rem', lineHeight: '1.6' }}>
                                    {selectedRecordingTranscription.transcripcion}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                                    No hay transcripción disponible para esta grabación.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
