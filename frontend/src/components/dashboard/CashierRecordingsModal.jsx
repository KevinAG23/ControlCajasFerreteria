import React, { useState, useMemo, useEffect } from 'react';
import { getEcuadorDateString, getEcuadorTimeString } from '../../utils/date';
import {
    PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend as RechartsLegend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, RadarChart, PolarGrid, PolarAngleAxis, Radar
} from 'recharts';
import { getGrabacionesByUsuario, getAnalisis } from '../../api/grabaciones';

// ─── Colors ────────────────────────────────────────────────────────────────────
const SENTIMENT_COLORS = {
    'Positivo': { bg: '#dcfce7', text: '#15803d', dot: '#4ade80', border: '#86efac' },
    'Negativo': { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444', border: '#fca5a5' },
    'Neutral': { bg: '#fef3c7', text: '#92400e', dot: '#fbbf24', border: '#fde68a' },
    'Neutral-Positivo': { bg: '#e0f2fe', text: '#0369a1', dot: '#38bdf8', border: '#7dd3fc' },
    'Neutral-Negativo': { bg: '#fce7f3', text: '#9d174d', dot: '#f472b6', border: '#f9a8d4' },
};

const METRIC_CFG = {
    CES: { label: 'CES', desc: 'Customer Effort Score', icon: '⚡', gradient: 'linear-gradient(135deg,#0f766e,#14b8a6)' },
    INS: { label: 'INS', desc: 'Índice de Satisfacción', icon: '😊', gradient: 'linear-gradient(135deg,#1e40af,#3b82f6)' },
    NPS: { label: 'NPS', desc: 'Net Promoter Score', icon: '🎯', gradient: 'linear-gradient(135deg,#6d28d9,#8b5cf6)' },
};

const PIE_COLORS = ['#4ade80', '#fbbf24', '#f87171'];

// ─── Parser ─────────────────────────────────────────────────────────────────────
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

        let rawScore = 0;
        const scoreMatch = r.justificacion_ia?.match(/\[SCORE=([^\]]+)\]/);
        if (scoreMatch) rawScore = scoreMatch[1];
        
        let val;
        let max = null;
        if (isNumeric) {
            val = parseFloat(rawScore);
            if (isNaN(val)) val = 0;
            max = config.max || 10;
        } else {
            val = rawScore || (r.respuesta_booleana ? "Sí" : "No");
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

// ─── Gauge Component ────────────────────────────────────────────────────────────
function ScoreGauge({ value, max, color, size = 80 }) {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    const radius = (size - 12) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDash = (pct / 100) * circumference;
    const cx = size / 2;
    const cy = size / 2;

    return (
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
            <circle
                cx={cx} cy={cy} r={radius}
                fill="none" stroke={color} strokeWidth="8"
                strokeDasharray={`${strokeDash} ${circumference}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 1s ease' }}
            />
        </svg>
    );
}

// ─── Custom Tooltip ─────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem 1rem', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', fontSize: '0.8rem' }}>
            {label && <p style={{ fontWeight: '700', color: '#0f172a', margin: '0 0 0.25rem' }}>{label}</p>}
            {payload.map((p, i) => (
                <p key={i} style={{ margin: '0.1rem 0', color: p.fill || p.stroke || '#475569' }}>
                    {p.name}: <strong>{p.value}{p.unit || ''}</strong>
                </p>
            ))}
        </div>
    );
};

// ─── AnalisisView ───────────────────────────────────────────────────────────────
function AnalisisView({ recording, onClose }) {
    const [analisisData, setAnalisisData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await getAnalisis(recording.rawId);
                setAnalisisData(data);
            } catch (err) {
                setError(err?.message || 'Error al cargar el análisis');
            } finally {
                setLoading(false);
            }
        })();
    }, [recording]);

    const metrics = useMemo(
        () => buildMetricsFromRespuestas(analisisData?.respuestas),
        [analisisData]
    );

    const summary = useMemo(
        () => extractSummary(analisisData?.resumen_ejecutivo),
        [analisisData]
    );

    const sentimentCfg = SENTIMENT_COLORS[analisisData?.sentimiento_general] || SENTIMENT_COLORS['Neutral'];

    // Respuestas agrupadas por categoría
    const respuestasAgrupadas = useMemo(() => {
        if (!analisisData?.respuestas?.length) return {};
        return analisisData.respuestas.reduce((acc, r) => {
            const cat = r.pregunta?.categoria?.nombre || 'General';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(r);
            return acc;
        }, {});
    }, [analisisData]);

    // Pie chart — distribución positivo/neutral/negativo por puntaje
    const sentimentPieData = useMemo(() => {
        const groups = { Positivo: 0, Neutral: 0, Negativo: 0 };
        analisisData?.respuestas?.forEach(r => {
            const pct = r.pregunta?.peso_puntaje
                ? ((r.puntaje_obtenido || 0) / r.pregunta.peso_puntaje) * 100
                : 0;
            if (pct >= 70) groups.Positivo++;
            else if (pct >= 40) groups.Neutral++;
            else groups.Negativo++;
        });
        return Object.entries(groups).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
    }, [analisisData]);

    // Bar chart — score por categoría
    const catScoreData = useMemo(() => {
        return Object.entries(respuestasAgrupadas).map(([cat, items]) => {
            const total = items.reduce((a, r) => a + (r.puntaje_obtenido || 0), 0);
            const max = items.reduce((a, r) => a + (r.pregunta?.peso_puntaje || 1), 0);
            const score = Math.round((total / (max || 1)) * 100);
            return {
                name: cat.length > 16 ? cat.substring(0, 14) + '…' : cat,
                fullName: cat,
                score,
                fill: score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444',
            };
        });
    }, [respuestasAgrupadas]);

    // Radar data from metrics
    const radarData = useMemo(() => {
        return metrics.map(m => ({
            metric: m.name,
            valor: Math.round((m.value / m.max) * 100),
        }));
    }, [metrics]);

    // ── Loading / Error states ──
    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '320px' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</div>
                <p style={{ color: '#64748b', fontWeight: '600', fontSize: '0.9rem' }}>Cargando análisis...</p>
            </div>
        </div>
    );

    if (error) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '320px' }}>
            <div style={{ textAlign: 'center', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '16px', padding: '2rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
                <p style={{ color: '#dc2626', fontWeight: '600', fontSize: '0.9rem', margin: 0 }}>{error}</p>
            </div>
        </div>
    );

    if (!analisisData) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '320px' }}>
            <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🔍</div>
                <p style={{ fontWeight: '700', color: '#64748b', margin: '0 0 0.35rem' }}>Sin análisis disponible</p>
                <p style={{ margin: 0, fontSize: '0.8rem' }}>Esta grabación aún no ha sido analizada por IA</p>
            </div>
        </div>
    );

    const calGeneral = analisisData.calificacion_general;
    const calPct = calGeneral ? (Number(calGeneral) / 10) * 100 : 0;
    const calColor = calPct >= 70 ? '#059669' : calPct >= 40 ? '#d97706' : '#dc2626';

    return (
        <div style={{ overflowY: 'auto', maxHeight: '78vh' }}>
            <style>{`
                @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
                @keyframes barIn { from { width:0; } to { width:100%; } }
                .analisis-card { animation: fadeUp 0.35s ease both; }
            `}</style>

            {/* ── MÉTRICAS DINÁMICAS + Calificación General ── */}
            {metrics.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${metrics.length + 1}, 1fr)`, gap: '0.85rem', marginBottom: '1.25rem' }}>
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
                            // Render estético para booleanos o strings (Ej. 'Bueno', 'True')
                            color = '#4f46e5';
                            bg = '#eef2ff';
                            border = '#a5b4fc';
                            displayVal = m.value;
                        }

                        let metaKey = m.name.length > 3 ? m.name.substring(0, 3).toUpperCase() : m.name;
                        const cfg = { icon: '📊', desc: m.name.length > 25 ? m.name.substring(0, 22) + '...' : m.name, gradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)' };

                        return (
                            <div key={i} className="analisis-card" style={{
                                background: bg,
                                border: `1.5px solid ${border}`,
                                borderRadius: '16px',
                                padding: '1.1rem',
                                textAlign: 'center',
                                position: 'relative',
                                overflow: 'hidden',
                                animationDelay: `${i * 0.05}s`,
                            }}>
                                {/* Gradient accent bar on top */}
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: cfg.gradient, borderRadius: '16px 16px 0 0' }} />

                                {m.isNumeric ? (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', marginBottom: '0.5rem' }}>
                                            <ScoreGauge value={m.value} max={m.max} color={color} size={72} />
                                            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '1.3rem', fontWeight: '800', color, lineHeight: 1 }}>
                                                {m.value}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '72px', marginBottom: '0.5rem', fontSize: '2.5rem' }}>
                                            {cfg.icon}
                                        </div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color, marginBottom: '0.5rem', padding: '0 0.5rem', lineHeight: 1.2 }}>
                                            {String(m.value)}
                                        </div>
                                    </>
                                )}

                                <div style={{ fontSize: '0.6rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', color, marginBottom: '0.15rem' }}>
                                    {metaKey}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.4rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                    {cfg.desc} {m.isNumeric && `· ${m.value}/${m.max}`}
                                </div>

                                {/* Explícito badge */}
                                {m.explicito !== null && (
                                    <span style={{
                                        display: 'inline-block',
                                        background: m.explicito ? '#dbeafe' : '#f3f4f6',
                                        color: m.explicito ? '#1d4ed8' : '#6b7280',
                                        border: `1px solid ${m.explicito ? '#93c5fd' : '#d1d5db'}`,
                                        borderRadius: '99px',
                                        fontSize: '0.62rem',
                                        fontWeight: '700',
                                        padding: '0.12rem 0.5rem',
                                        letterSpacing: '0.03em',
                                    }}>
                                        {m.explicito ? '✦ Explícito' : '○ Implícito'}
                                    </span>
                                )}

                                {/* Progress bar - Only show for numerics */}
                                {m.isNumeric && (
                                    <div style={{ marginTop: '0.6rem', height: '5px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                                        <div style={{
                                            width: `${pct}%`, height: '100%', background: color,
                                            borderRadius: '99px', transition: 'width 0.9s ease',
                                        }} />
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Calificación General */}
                    <div className="analisis-card" style={{
                        background: 'white',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '1.1rem',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        animationDelay: `${metrics.length * 0.05}s`,
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: '16px 16px 0 0' }} />

                        <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', marginBottom: '0.5rem' }}>
                            <ScoreGauge value={Number(calGeneral || 0)} max={10} color={calColor} size={72} />
                            <div style={{
                                position: 'absolute', top: '50%', left: '50%',
                                transform: 'translate(-50%, -50%)',
                                lineHeight: 1,
                            }}>
                                <span style={{ fontSize: '1.15rem', fontWeight: '800', color: calColor }}>
                                    {calGeneral != null ? Number(calGeneral).toFixed(1) : '—'}
                                </span>
                            </div>
                        </div>

                        <div style={{ fontSize: '0.6rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6366f1', marginBottom: '0.15rem' }}>
                            PROMEDIO
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.4rem' }}>
                            Calificación General · <strong>/ 10</strong>
                        </div>

                        {calGeneral != null && (
                            <div style={{ marginTop: '0.6rem', height: '5px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                                <div style={{
                                    width: `${calPct}%`, height: '100%',
                                    background: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
                                    borderRadius: '99px', transition: 'width 0.9s ease',
                                }} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── RESUMEN EJECUTIVO ── */}
            {summary && (
                <div className="analisis-card" style={{
                    background: 'linear-gradient(135deg, #6366f108, #8b5cf608)',
                    border: '1.5px solid #6366f122',
                    borderRadius: '16px',
                    padding: '1.25rem 1.5rem',
                    marginBottom: '1.25rem',
                    animationDelay: '0.15s',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.7rem', flexWrap: 'wrap' }}>
                        <div style={{
                            width: '30px', height: '30px', borderRadius: '8px',
                            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.9rem', flexShrink: 0,
                        }}>📋</div>
                        <span style={{ fontWeight: '800', fontSize: '0.88rem', color: '#4f46e5' }}>Resumen Ejecutivo</span>
                        <span style={{
                            marginLeft: 'auto',
                            background: sentimentCfg.bg,
                            color: sentimentCfg.text,
                            border: `1px solid ${sentimentCfg.border}`,
                            padding: '0.22rem 0.7rem',
                            borderRadius: '99px',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            whiteSpace: 'nowrap',
                        }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: sentimentCfg.dot, display: 'inline-block', flexShrink: 0 }} />
                            {analisisData.sentimiento_general || 'Neutral'}
                        </span>
                    </div>
                    <p style={{ margin: 0, color: '#334155', fontSize: '0.86rem', lineHeight: '1.7', borderLeft: '3px solid #6366f140', paddingLeft: '0.85rem' }}>
                        {summary}
                    </p>
                </div>
            )}

            {/* ── CHARTS ROW ── */}
            {(sentimentPieData.length > 0 || catScoreData.length > 0 || radarData.length > 0) && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: radarData.length > 0 && catScoreData.length > 0
                        ? '1fr 1.4fr 1fr'
                        : catScoreData.length > 0 ? '1fr 1.5fr' : '1fr',
                    gap: '0.85rem',
                    marginBottom: '1.25rem',
                }}>
                    {/* Pie — distribución respuestas */}
                    {sentimentPieData.length > 0 && (
                        <div className="analisis-card" style={{
                            background: 'white',
                            border: '1px solid #f1f5f9',
                            borderRadius: '14px',
                            padding: '1.1rem',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                            animationDelay: '0.2s',
                        }}>
                            <p style={{ margin: '0 0 0.6rem', fontWeight: '700', fontSize: '0.82rem', color: '#1e293b' }}>
                                Distribución de Respuestas
                            </p>
                            <div style={{ height: 180 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={sentimentPieData} cx="50%" cy="50%" innerRadius="38%" outerRadius="65%" dataKey="value" paddingAngle={4}>
                                            {sentimentPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                        </Pie>
                                        <RechartsTooltip content={<CustomTooltip />} />
                                        <RechartsLegend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.72rem' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Bar — score por categoría */}
                    {catScoreData.length > 0 && (
                        <div className="analisis-card" style={{
                            background: 'white',
                            border: '1px solid #f1f5f9',
                            borderRadius: '14px',
                            padding: '1.1rem',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                            animationDelay: '0.25s',
                        }}>
                            <p style={{ margin: '0 0 0.6rem', fontWeight: '700', fontSize: '0.82rem', color: '#1e293b' }}>
                                Score por Categoría (%)
                            </p>
                            <div style={{ height: 180 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={catScoreData} margin={{ top: 4, right: 8, left: -24, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                        <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                        <RechartsTooltip
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.length) return null;
                                                const d = payload[0].payload;
                                                return (
                                                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.6rem 0.9rem', fontSize: '0.78rem', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
                                                        <p style={{ margin: '0 0 0.2rem', fontWeight: '700', color: '#0f172a' }}>{d.fullName}</p>
                                                        <p style={{ margin: 0, color: d.fill, fontWeight: '700' }}>Score: {d.score}%</p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Bar dataKey="score" radius={[5, 5, 0, 0]}>
                                            {catScoreData.map((entry, i) => (
                                                <Cell key={i} fill={entry.fill} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Radar — métricas CES/INS/NPS */}
                    {radarData.length >= 2 && (
                        <div className="analisis-card" style={{
                            background: 'white',
                            border: '1px solid #f1f5f9',
                            borderRadius: '14px',
                            padding: '1.1rem',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                            animationDelay: '0.3s',
                        }}>
                            <p style={{ margin: '0 0 0.6rem', fontWeight: '700', fontSize: '0.82rem', color: '#1e293b' }}>
                                Perfil de Métricas (%)
                            </p>
                            <div style={{ height: 180 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart data={radarData} margin={{ top: 8, right: 20, left: 20, bottom: 8 }}>
                                        <PolarGrid stroke="#e2e8f0" />
                                        <PolarAngleAxis dataKey="metric" tick={{ fill: '#64748b', fontSize: 11 }} />
                                        <Radar name="Métricas" dataKey="valor" stroke="#6366f1" fill="#6366f1" fillOpacity={0.22} strokeWidth={2.5} dot={{ r: 3, fill: '#6366f1' }} />
                                        <RechartsTooltip formatter={(v) => [`${v}%`, 'Rendimiento']} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── EVALUACIÓN DETALLADA ── */}
            {Object.keys(respuestasAgrupadas).length > 0 && (
                <div className="analisis-card" style={{
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
                    marginBottom: '1rem',
                    animationDelay: '0.35s',
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '0.9rem 1.4rem',
                        background: 'linear-gradient(130deg,#4f46e5,#6366f1)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{ fontSize: '1rem' }}>📝</span>
                            <span style={{ fontWeight: '700', fontSize: '0.9rem', color: 'white' }}>Evaluación Detallada</span>
                        </div>
                        <span style={{
                            background: 'rgba(255,255,255,0.18)',
                            color: 'white',
                            border: '1px solid rgba(255,255,255,0.28)',
                            borderRadius: '20px',
                            padding: '0.18rem 0.7rem',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                        }}>
                            {analisisData.respuestas?.length || 0} ítems
                        </span>
                    </div>

                    {/* Category groups */}
                    {Object.entries(respuestasAgrupadas).map(([cat, items]) => {
                        const catTotal = items.reduce((a, r) => a + (r.puntaje_obtenido || 0), 0);
                        const catMax = items.reduce((a, r) => a + (r.pregunta?.peso_puntaje || 1), 0);
                        const catPct = Math.round((catTotal / (catMax || 1)) * 100);
                        const catColor = catPct >= 70 ? '#059669' : catPct >= 40 ? '#d97706' : '#dc2626';
                        const catBg = catPct >= 70 ? '#ecfdf5' : catPct >= 40 ? '#fffbeb' : '#fef2f2';
                        return (
                            <div key={cat} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                {/* Category header row */}
                                <div style={{
                                    padding: '0.65rem 1.4rem',
                                    background: '#fafafa',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                }}>
                                    <div style={{ height: '3px', width: '20px', borderRadius: '4px', background: catColor, flexShrink: 0 }} />
                                    <span style={{ fontWeight: '700', fontSize: '0.78rem', color: '#334155', flex: 1 }}>{cat}</span>
                                    <span style={{
                                        background: catBg, color: catColor,
                                        border: `1px solid ${catColor}40`,
                                        padding: '0.18rem 0.6rem',
                                        borderRadius: '99px',
                                        fontSize: '0.68rem',
                                        fontWeight: '700',
                                    }}>{catPct}%</span>
                                    <div style={{ width: '70px', height: '5px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                                        <div style={{ width: `${catPct}%`, height: '100%', background: catColor, borderRadius: '99px', transition: 'width 0.8s ease' }} />
                                    </div>
                                </div>

                                {/* Question items */}
                                {items.map((r, idx) => {
                                    const itemPct = r.pregunta?.peso_puntaje
                                        ? Math.round(((r.puntaje_obtenido || 0) / r.pregunta.peso_puntaje) * 100)
                                        : null;
                                    const pass = itemPct !== null && itemPct >= 70;
                                    const itemColor = itemPct === null ? '#94a3b8' : itemPct >= 70 ? '#059669' : itemPct >= 40 ? '#d97706' : '#dc2626';
                                    return (
                                        <div key={idx} style={{
                                            padding: '0.7rem 1.4rem 0.7rem 2.25rem',
                                            display: 'grid',
                                            gridTemplateColumns: '1fr auto',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            borderTop: '1px solid #f8fafc',
                                            background: idx % 2 === 0 ? 'white' : '#fafafa',
                                        }}>
                                            <div>
                                                <p style={{ margin: '0 0 0.18rem', fontSize: '0.8rem', fontWeight: '600', color: '#1e293b', lineHeight: '1.4' }}>
                                                    <span style={{ marginRight: '0.35rem' }}>{pass ? '✅' : itemPct === null ? '⬜' : '❌'}</span>
                                                    {r.pregunta?.texto_pregunta || 'Sin pregunta'}
                                                </p>
                                                {r.justificacion_ia && (
                                                    <p style={{ margin: 0, fontSize: '0.73rem', color: '#64748b', fontStyle: 'italic', borderLeft: '2px solid #e2e8f0', paddingLeft: '0.5rem' }}>
                                                        {r.justificacion_ia}
                                                    </p>
                                                )}
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <span style={{ fontWeight: '800', fontSize: '0.95rem', color: itemColor }}>
                                                    {r.puntaje_obtenido != null ? r.puntaje_obtenido : '—'}
                                                </span>
                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>/{r.pregunta?.peso_puntaje || '?'}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Close button */}
            <div style={{ textAlign: 'right', paddingTop: '0.25rem' }}>
                <button onClick={onClose} style={{
                    padding: '0.65rem 2rem',
                    background: 'linear-gradient(135deg,#4f46e5,#6366f1)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: '700',
                    fontSize: '0.85rem',
                    boxShadow: '0 4px 14px rgba(99,102,241,0.38)',
                    transition: 'all 0.15s',
                }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                    Cerrar
                </button>
            </div>
        </div>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function CashierRecordingsModal({ cashier, onClose }) {
    const [filterPeriod, setFilterPeriod] = useState('month');
    const [customDates, setCustomDates] = useState({ start: '', end: '' });
    const [allRecordings, setAllRecordings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeAnalysis, setActiveAnalysis] = useState(null);

    useEffect(() => {
        if (!cashier?.id) return;
        (async () => {
            setLoading(true);
            try {
                const data = await getGrabacionesByUsuario(cashier.id);
                const mapped = data.map(rec => ({
                    rawId: rec.id,
                    id: rec.id.split('-')[0],
                    date: getEcuadorDateString(rec.fecha_hora_inicio),
                    time: getEcuadorTimeString(rec.fecha_hora_inicio),
                    duration: rec.duracion_segundos
                        ? `${Math.floor(rec.duracion_segundos / 60)}:${String(rec.duracion_segundos % 60).padStart(2, '0')}`
                        : '—',
                    sentiment: rec.analisis?.sentimiento_general || 'Neutral',
                    calificacion: rec.analisis?.calificacion_general,
                }));
                setAllRecordings(mapped);
            } catch (err) {
                console.error('Error loading recordings', err);
            } finally {
                setLoading(false);
            }
        })();
    }, [cashier]);


    const filteredRecordings = useMemo(() => {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        return allRecordings.filter(rec => {
            if (filterPeriod === 'today') return rec.date === todayStr;
            if (filterPeriod === 'week') { const w = new Date(now); w.setDate(w.getDate() - 7); return new Date(rec.date) >= w; }
            if (filterPeriod === 'month') { const m = new Date(now); m.setMonth(m.getMonth() - 1); return new Date(rec.date) >= m; }
            if (filterPeriod === 'custom' && customDates.start && customDates.end)
                return rec.date >= customDates.start && rec.date <= customDates.end;
            return true;
        });
    }, [allRecordings, filterPeriod, customDates]);

    const FILTER_LABELS = { today: 'Hoy', week: 'Semana', month: 'Mes', custom: 'Rango' };

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.68)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1100, backdropFilter: 'blur(6px)', padding: '1rem',
        }}>
            <div style={{
                background: '#f8fafc',
                borderRadius: '24px',
                width: '100%', maxWidth: '1020px', maxHeight: '92vh',
                boxShadow: '0 32px 80px -16px rgba(15,23,42,0.42)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                animation: 'recModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
            }}>
                <style>{`
                    @keyframes recModalIn {
                        from { opacity:0; transform:translateY(20px) scale(0.97); }
                        to   { opacity:1; transform:translateY(0) scale(1); }
                    }
                `}</style>

                {/* ── Header ── */}
                <div style={{
                    padding: '1.35rem 1.75rem',
                    background: 'linear-gradient(130deg,#312e81 0%,#4f46e5 55%,#818cf8 100%)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
                    position: 'relative', overflow: 'hidden',
                }}>
                    <div style={{ position: 'absolute', right: '-30px', top: '-30px', width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
                    <div style={{ zIndex: 1 }}>
                        <h2 style={{ margin: 0, color: 'white', fontWeight: '800', fontSize: '1.2rem', letterSpacing: '-0.02em' }}>
                            🎙️ Historial de Grabaciones
                        </h2>
                        <p style={{ margin: '0.2rem 0 0', color: '#c7d2fe', fontSize: '0.82rem' }}>
                            {cashier?.username || 'Cajero'} · {filteredRecordings.length} grabaciones
                        </p>
                    </div>
                    <button onClick={onClose} style={{
                        zIndex: 1,
                        background: 'rgba(255,255,255,0.13)',
                        border: '1px solid rgba(255,255,255,0.25)',
                        borderRadius: '10px', padding: '0.4rem 0.75rem',
                        cursor: 'pointer', color: 'white', fontSize: '1rem',
                        transition: 'all 0.15s',
                    }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.24)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.13)'}
                    >✕</button>
                </div>

                {/* ── Ver Análisis view ── */}
                {activeAnalysis ? (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                        {/* Breadcrumb */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                            <button onClick={() => setActiveAnalysis(null)} style={{
                                background: '#eef2ff', border: '1px solid #c7d2fe',
                                borderRadius: '8px', padding: '0.38rem 0.85rem',
                                cursor: 'pointer', fontSize: '0.8rem', color: '#4f46e5', fontWeight: '700',
                                display: 'flex', alignItems: 'center', gap: '0.35rem',
                                transition: 'all 0.15s',
                            }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#4f46e5'; e.currentTarget.style.color = 'white'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.color = '#4f46e5'; }}
                            >
                                ← Volver
                            </button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Análisis de grabación</span>
                                <span style={{ fontFamily: 'monospace', background: '#eef2ff', color: '#4f46e5', padding: '0.12rem 0.5rem', borderRadius: '5px', fontSize: '0.75rem', fontWeight: '700', border: '1px solid #c7d2fe' }}>
                                    {activeAnalysis.id}
                                </span>
                            </div>
                        </div>
                        <AnalisisView recording={activeAnalysis} onClose={() => setActiveAnalysis(null)} />
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* Filters */}
                        <div style={{
                            padding: '0.75rem 1.5rem',
                            background: 'white',
                            borderBottom: '1px solid #f1f5f9',
                            display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap',
                        }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: '0.25rem' }}>Período</span>
                            {Object.entries(FILTER_LABELS).map(([p, label]) => {
                                const active = filterPeriod === p;
                                return (
                                    <button key={p} onClick={() => setFilterPeriod(p)} style={{
                                        padding: '0.35rem 0.85rem',
                                        borderRadius: '8px',
                                        border: `1.5px solid ${active ? '#6366f1' : '#e2e8f0'}`,
                                        background: active ? '#6366f1' : 'white',
                                        color: active ? 'white' : '#475569',
                                        fontWeight: active ? '700' : '500',
                                        fontSize: '0.8rem', cursor: 'pointer',
                                        transition: 'all 0.15s',
                                    }}>
                                        {label}
                                    </button>
                                );
                            })}
                            {filterPeriod === 'custom' && (
                                <>
                                    <input type="date" value={customDates.start}
                                        onChange={e => setCustomDates({ ...customDates, start: e.target.value })}
                                        style={{ padding: '0.35rem 0.5rem', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '0.8rem', outline: 'none' }}
                                    />
                                    <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>—</span>
                                    <input type="date" value={customDates.end}
                                        onChange={e => setCustomDates({ ...customDates, end: e.target.value })}
                                        style={{ padding: '0.35rem 0.5rem', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '0.8rem', outline: 'none' }}
                                    />
                                </>
                            )}
                        </div>

                        {/* Table */}
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                                        {['ID', 'Fecha', 'Hora', 'Duración', 'Sentimiento', 'Calificación', 'Acción'].map(h => (
                                            <th key={h} style={{
                                                padding: '0.75rem 1rem',
                                                textAlign: 'left',
                                                fontSize: '0.68rem',
                                                fontWeight: '700',
                                                color: '#94a3b8',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.06em',
                                            }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={7} style={{ textAlign: 'center', padding: '3.5rem', color: '#94a3b8' }}>
                                                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
                                                <p style={{ margin: 0, fontWeight: '600', fontSize: '0.88rem' }}>Cargando grabaciones...</p>
                                            </td>
                                        </tr>
                                    ) : filteredRecordings.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ textAlign: 'center', padding: '3.5rem', color: '#94a3b8' }}>
                                                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📭</div>
                                                <p style={{ margin: 0, fontWeight: '700', color: '#64748b', fontSize: '0.9rem' }}>Sin grabaciones en este período</p>
                                            </td>
                                        </tr>
                                    ) : filteredRecordings.map((rec, idx) => {
                                        const sc = SENTIMENT_COLORS[rec.sentiment] || SENTIMENT_COLORS['Neutral'];
                                        const calFixed = rec.calificacion != null ? Number(rec.calificacion).toFixed(1) : null;
                                        const calColor2 = calFixed ? (Number(calFixed) >= 7 ? '#059669' : Number(calFixed) >= 4 ? '#d97706' : '#dc2626') : '#94a3b8';
                                        return (
                                            <tr key={rec.rawId} style={{
                                                borderBottom: '1px solid #f8fafc',
                                                background: idx % 2 === 0 ? 'white' : '#fafafa',
                                                transition: 'background 0.12s',
                                            }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                                                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'white' : '#fafafa'}
                                            >
                                                <td style={{ padding: '0.75rem 1rem' }}>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: '700', color: '#4f46e5', background: '#eef2ff', padding: '0.15rem 0.45rem', borderRadius: '5px', fontSize: '0.78rem', border: '1px solid #c7d2fe' }}>
                                                        {rec.id}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#475569' }}>{rec.date}</td>
                                                <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#475569' }}>{rec.time}</td>
                                                <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#94a3b8' }}>{rec.duration}</td>
                                                <td style={{ padding: '0.75rem 1rem' }}>
                                                    <span style={{
                                                        background: sc.bg, color: sc.text,
                                                        border: `1px solid ${sc.border}`,
                                                        padding: '0.22rem 0.65rem',
                                                        borderRadius: '99px',
                                                        fontSize: '0.72rem', fontWeight: '700',
                                                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                                                        {rec.sentiment}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                    {calFixed ? (
                                                        <span style={{ fontWeight: '800', color: calColor2, fontSize: '0.92rem' }}>
                                                            {calFixed}<span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '400' }}>/10</span>
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem' }}>
                                                    <button onClick={() => setActiveAnalysis(rec)} style={{
                                                        padding: '0.32rem 0.85rem',
                                                        background: '#eef2ff',
                                                        border: '1px solid #c7d2fe',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        color: '#4f46e5',
                                                        fontWeight: '700',
                                                        fontSize: '0.75rem',
                                                        transition: 'all 0.15s',
                                                        whiteSpace: 'nowrap',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.3rem',
                                                    }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = '#4f46e5'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = '#4f46e5'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.color = '#4f46e5'; e.currentTarget.style.borderColor = '#c7d2fe'; }}
                                                    >
                                                        📊 Ver Análisis
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
