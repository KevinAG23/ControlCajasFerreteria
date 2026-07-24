import React, { useState, useEffect, useRef } from 'react';
import { getAtencionesByCajero, getAnalisisByAtencion } from '../../api/atenciones';
import { getEcuadorDateString, getEcuadorTimeString } from '../../utils/date';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
    CartesianGrid, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const IconX = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>;
const IconClock = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IconChevronRight = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>;
const IconBarChart2 = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const IconStar = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>;
const IconSmile = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>;
const IconFilter = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;
const IconCalendar = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;

// ─── Sentiment config ─────────────────────────────────────────────────────────
const SENTIMENT = {
    POSITIVO:  { bg: 'linear-gradient(135deg,#dcfce7,#bbf7d0)', color: '#15803d', border: '#86efac', emoji: '😊', label: 'Positivo' },
    NEUTRO:    { bg: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', color: '#475569', border: '#cbd5e1', emoji: '😐', label: 'Neutro' },
    NEGATIVO:  { bg: 'linear-gradient(135deg,#fee2e2,#fecaca)', color: '#991b1b', border: '#fca5a5', emoji: '😞', label: 'Negativo' },
};

// ─── Custom Tooltip for Bar Chart ─────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.75rem 1rem', boxShadow: '0 10px 25px rgba(0,0,0,0.12)' }}>
            <p style={{ margin: '0 0 0.25rem', fontWeight: '700', color: '#0f172a', fontSize: '0.8rem' }}>{label}</p>
            <p style={{ margin: 0, color: '#ea580c', fontWeight: '800', fontSize: '1.1rem' }}>{payload[0]?.value}</p>
        </div>
    );
};

// ─── Nested Analysis Modal ────────────────────────────────────────────────────
function AnalysisModal({ analysis, atencion, onClose, inline = false }) {
    const [showTranscription, setShowTranscription] = useState(false);
    const [showAudioPlayer, setShowAudioPlayer] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [audioError, setAudioError] = useState(null);
    const audioRef = useRef(null);

    const NEW_API_URL = import.meta.env.VITE_NEW_API_URL || 'http://localhost:8000/api/v1';
    const audioUrl = atencion.grabacionId ? `${NEW_API_URL}/audio/${atencion.grabacionId}/enhanced` : null;

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play().then(() => {
                setIsPlaying(true);
                setAudioError(null);
            }).catch(err => {
                console.error("Audio playback error:", err);
                setAudioError("Error al reproducir el audio. Puede no estar disponible aún.");
            });
        }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
            setAudioError(null);
        }
    };

    const handleAudioEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
    };

    const handleSeek = (e) => {
        const time = parseFloat(e.target.value);
        setCurrentTime(time);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
        }
    };

    const skipForward = () => {
        if (audioRef.current) {
            audioRef.current.currentTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 10);
        }
    };

    const skipBackward = () => {
        if (audioRef.current) {
            audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
        }
    };

    const changePlaybackRate = (rate) => {
        setPlaybackRate(rate);
        if (audioRef.current) {
            audioRef.current.playbackRate = rate;
        }
    };

    const formatTime = (secs) => {
        if (isNaN(secs)) return "00:00";
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    if (!analysis) return null;

    const sent = SENTIMENT[analysis.sentimiento_general] || SENTIMENT.NEUTRO;
    const score = analysis.calificacion_general ?? 0;
    const scoreColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
    const numericEvals = (analysis.evaluaciones || []).filter(ev => ev.puntaje !== null);
    const boolEvals = (analysis.evaluaciones || []).filter(ev => ev.puntaje === null);

    // Calculate detailed compliance stats
    const totalEvals = (analysis.evaluaciones || []).length;
    const passedEvals = (analysis.evaluaciones || []).filter(ev => ev.cumple).length;
    const failedEvals = (analysis.evaluaciones || []).filter(ev => !ev.cumple);
    const compliancePercent = totalEvals > 0 ? Math.round((passedEvals / totalEvals) * 100) : 0;

    // Define the 3 categories for the triangle radar chart
    const categoriesList = ["ATENCIÓN AL CLIENTE", "VENTAS Y SUGERENCIAS", "MARKETING"];
    
    // Group boolean evaluations by category
    const categoryTotals = {
        "ATENCIÓN AL CLIENTE": { total: 0, passed: 0 },
        "VENTAS Y SUGERENCIAS": { total: 0, passed: 0 },
        "MARKETING": { total: 0, passed: 0 }
    };

    const categoryQuestions = {
        "ATENCIÓN AL CLIENTE": [],
        "VENTAS Y SUGERENCIAS": [],
        "MARKETING": []
    };
    
    boolEvals.forEach(ev => {
        let catName = ev.categoria_nombre;
        
        // Fallback: map question text to category name to support older/cached records
        if (!catName && ev.pregunta_texto) {
            const txt = ev.pregunta_texto.toUpperCase();
            if (txt.includes("SALUDO") || txt.includes("AYUDAR") || txt.includes("PRECIO") || txt.includes("RETIR") ||
                txt.includes("DEVOLV") || txt.includes("DESPID") || txt.includes("CANTIDAD") || txt.includes("DATOS") ||
                txt.includes("FACTURA") || txt.includes("RETIRO") || txt.includes("BODEGA") || txt.includes("ENTREGA") ||
                txt.includes("DISPONIB") || txt.includes("NECESIT") || txt.includes("FACTURADO")) {
                catName = "ATENCIÓN AL CLIENTE";
            } else if (txt.includes("ADICIONAL") || txt.includes("CALIDAD") || txt.includes("RENDIMIENTO") || txt.includes("ALTERNATIVA")) {
                catName = "VENTAS Y SUGERENCIAS";
            } else if (txt.includes("PROMOCION") || txt.includes("NUEVO") || txt.includes("NUEVOS") || txt.includes("REGRESE")) {
                catName = "MARKETING";
            } else {
                catName = "ATENCIÓN AL CLIENTE"; // general fallback
            }
        }
        
        if (catName && categoryTotals[catName]) {
            categoryTotals[catName].total += 1;
            if (ev.cumple) {
                categoryTotals[catName].passed += 1;
            }
            categoryQuestions[catName].push({
                name: ev.pregunta_texto.length > 30 ? ev.pregunta_texto.slice(0, 30) + "..." : ev.pregunta_texto,
                fullName: ev.pregunta_texto,
                value: ev.cumple ? 100 : 0,
                cumple: ev.cumple
            });
        }
    });

    // Construct the 3 radar vertices (triangle!)
    const radarData = categoriesList.map(cat => {
        const stats = categoryTotals[cat];
        const value = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0;
        return {
            subject: cat,
            value: value,
            fullMark: 100
        };
    });

    const renderCategoryChart = (categoryName) => {
        const data = categoryQuestions[categoryName] || [];
        if (data.length === 0) {
            return (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#7c6a5f', fontSize: '0.85rem' }}>
                    Sin preguntas evaluadas en esta categoría.
                </div>
            );
        }
        
        return (
            <div style={{ width: '100%', height: data.length * 35 + 40, minHeight: 120 }}>
                <ResponsiveContainer>
                    <BarChart
                        data={data}
                        layout="vertical"
                        margin={{ top: 5, right: 15, left: 5, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#fee8d6" />
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis
                            dataKey="name"
                            type="category"
                            width={110}
                            tick={{ fill: '#431407', fontSize: 8, fontWeight: 700 }}
                        />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const item = payload[0].payload;
                                return (
                                    <div style={{
                                        background: 'white', border: '1px solid #fed7aa', borderRadius: '12px',
                                        padding: '0.75rem 1rem', boxShadow: '0 8px 20px rgba(59,29,17,0.1)',
                                        maxWidth: '280px',
                                        zIndex: 12000
                                    }}>
                                        <p style={{ margin: '0 0 0.5rem', fontWeight: '700', color: '#1e293b', fontSize: '0.8rem', lineHeight: '1.4' }}>
                                            {item.fullName}
                                        </p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <span style={{
                                                width: '8px', height: '8px', borderRadius: '50%',
                                                background: item.cumple ? '#10b981' : '#ef4444'
                                            }} />
                                            <span style={{ fontWeight: '800', fontSize: '0.85rem', color: item.cumple ? '#10b981' : '#ef4444' }}>
                                                {item.cumple ? 'Cumple (100%)' : 'No Cumple (0%)'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            }}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12}>
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.cumple ? '#10b981' : '#ef4444'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        );
    };

    const parseTranscriptText = (text) => {
        if (!text) return [];
        const lines = text.split('\n');
        const parsed = [];
        const regex = /^\[([\d\.]+)s\s*-\s*([\d\.]+)s\]\s*([^:]+):\s*(.*)$/;
        
        for (let line of lines) {
            const match = line.match(regex);
            if (match) {
                const inicio = parseFloat(match[1]);
                const fin = parseFloat(match[2]);
                const speakerRaw = match[3].trim();
                const textContent = match[4].trim();
                
                const isCajero = speakerRaw === 'SPEAKER_00' || speakerRaw.toLowerCase().includes('cajero');
                
                parsed.push({
                    inicio,
                    fin,
                    speaker: isCajero ? 'Cajero' : 'Usuario',
                    text: textContent
                });
            } else {
                if (line.trim()) {
                    parsed.push({
                        inicio: null,
                        fin: null,
                        speaker: 'Desconocido',
                        text: line.trim()
                    });
                }
            }
        }
        return parsed;
    };

    const groupSegmentsBySpeaker = (segments) => {
        const grouped = [];
        let currentGroup = null;
        
        for (let seg of segments) {
            if (currentGroup && currentGroup.speaker === seg.speaker) {
                currentGroup.texts.push({
                    inicio: seg.inicio,
                    fin: seg.fin,
                    text: seg.text
                });
            } else {
                if (currentGroup) {
                    grouped.push(currentGroup);
                }
                currentGroup = {
                    speaker: seg.speaker,
                    texts: [{
                        inicio: seg.inicio,
                        fin: seg.fin,
                        text: seg.text
                    }]
                };
            }
        }
        if (currentGroup) {
            grouped.push(currentGroup);
        }
        return grouped;
    };

    const containerStyle = {
        background: '#fffcf7', width: '100%', 
        borderRadius: '28px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: inline ? 'none' : '0 40px 80px -16px rgba(59,29,17,0.25), 0 0 0 1px #fed7aa',
        border: inline ? '1px solid #fed7aa' : 'none',
        animation: 'nestedIn 0.3s cubic-bezier(0.34,1.4,0.64,1)',
        height: inline ? 'auto' : '90vh',
    };

    const innerContent = (
        <div style={containerStyle}>
            <style>{`
                @keyframes nestedIn {
                    from { opacity:0; transform:scale(0.94) translateY(16px); }
                    to   { opacity:1; transform:scale(1) translateY(0); }
                }
                .eval-card { transition: border-color 0.2s, transform 0.2s; }
                .eval-card:hover { border-color: rgba(251,146,60,0.4) !important; transform: translateY(-1px); }
            `}</style>

            {/* Warm gradient header */}
            <div style={{
                padding: '1.75rem 2rem',
                background: 'linear-gradient(135deg, #ffedd5 0%, #fff7ed 60%)',
                borderBottom: '1px solid #fed7aa',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0,
            }}>
                <div>
                    <h2 style={{ margin: 0, color: '#431407', fontSize: '1.5rem', fontWeight: '800', letterSpacing: '-0.02em' }}>
                        Detalle de la Atención
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#7c6a5f', fontSize: '0.85rem' }}>
                            <IconClock /> {atencion.date}
                        </span>
                        <span style={{ color: '#fed7aa', fontSize: '0.7rem' }}>|</span>
                          <span style={{ color: '#ea580c', fontWeight: '700', fontSize: '0.9rem' }}>
                            {atencion.time} ➔ {atencion.timeEnd}
                        </span>
                        <span style={{ background: 'rgba(234,88,12,0.1)', color: '#ea580c', border: '1px solid rgba(234,88,12,0.25)', borderRadius: '999px', fontSize: '0.72rem', padding: '0.15rem 0.6rem', fontWeight: '700' }}>
                            Duración: {atencion.duration}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#15803d', fontWeight: '700', fontSize: '0.72rem', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '0.15rem 0.55rem', borderRadius: '999px' }}>
                            {compliancePercent}% de Cumplimiento
                        </span>
                    </div>
                </div>
                <button onClick={onClose} style={{
                    background: '#ea580c', border: 'none',
                    borderRadius: '12px', padding: '0.6rem 1.2rem', cursor: 'pointer',
                    color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '700',
                    fontSize: '0.85rem', transition: 'all 0.15s', boxShadow: '0 4px 12px rgba(234,88,12,0.2)'
                }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                    ← Volver a Atenciones
                </button>
            </div>

            {/* Scrollable Body */}
            <div style={{ padding: '2.5rem', overflowY: 'auto', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                
                {/* Score & Sentiment row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
                    
                    {/* Score Circle Card */}
                    <div style={{
                        background: 'white', border: '1px solid #fed7aa', borderRadius: '24px',
                        padding: '2rem', display: 'flex', alignItems: 'center', gap: '2rem',
                        boxShadow: '0 10px 25px -4px rgba(59,29,17,0.04)',
                    }}>
                        <div style={{ position: 'relative', width: '110px', height: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="110" height="110" style={{ transform: 'rotate(-90deg)' }}>
                                <circle cx="55" cy="55" r="48" fill="none" stroke="#ffedd5" strokeWidth="10" />
                                <circle cx="55" cy="55" r="48" fill="none" stroke={scoreColor} strokeWidth="10"
                                        strokeDasharray={2 * Math.PI * 48}
                                        strokeDashoffset={2 * Math.PI * 48 * (1 - score / 100)}
                                        strokeLinecap="round" />
                            </svg>
                            <span style={{ position: 'absolute', fontSize: '1.6rem', fontWeight: '900', color: '#1e293b' }}>
                                {Math.round(score)}
                            </span>
                        </div>
                        <div style={{ flex: 1 }}>
                            <h3 style={{ margin: '0 0 0.35rem', color: '#431407', fontSize: '1.2rem', fontWeight: '800' }}>Calificación General</h3>
                            <p style={{
                                margin: 0, color: '#7c6a5f', fontSize: '0.85rem', lineHeight: '1.45',
                                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                            }} title={analysis.resumen_ejecutivo}>
                                {analysis.resumen_ejecutivo || "Puntuación consolidada obtenida de los criterios obligatorios y adicionales evaluados por IA."}
                            </p>
                        </div>
                    </div>

                    {/* Sentiment Card */}
                    <div style={{
                        background: sent.bg, border: `1.5px solid ${sent.border}`, borderRadius: '24px',
                        padding: '2rem', display: 'flex', alignItems: 'center', gap: '2rem',
                        boxShadow: '0 10px 25px -4px rgba(0,0,0,0.03)',
                    }}>
                        <span style={{ fontSize: '3.5rem', lineHeight: 1 }}>{sent.emoji}</span>
                        <div>
                            <div style={{ color: sent.color, fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sentimiento Predominante</div>
                            <h3 style={{ margin: '0.2rem 0 0.35rem', color: sent.color, fontSize: '1.5rem', fontWeight: '900' }}>{sent.label}</h3>
                            <p style={{ margin: 0, color: sent.color, opacity: 0.8, fontSize: '0.85rem', lineHeight: '1.4' }}>
                                Tonalidad y actitud del usuario detectada de forma semántica en la interacción.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Main Content Layout */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '2.5rem' }}>
                    
                    {/* Compliance Checklist */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <h3 style={{ margin: 0, color: '#431407', fontSize: '1.2rem', fontWeight: '800', letterSpacing: '-0.01em' }}>
                                Lista de Cumplimiento Estándar
                            </h3>
                            <span style={{ fontSize: '0.8rem', color: '#7c6a5f', fontWeight: '600' }}>
                                Cumple {passedEvals} de {totalEvals}
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            {boolEvals.map((ev, idx) => (
                                <div key={idx} className="eval-card" style={{
                                    background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px',
                                    padding: '1.1rem 1.4rem', display: 'flex', gap: '1.2rem', alignItems: 'flex-start',
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.015)'
                                }}>
                                    <span style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: '24px', height: '24px', borderRadius: '50%',
                                        background: ev.cumple ? '#dcfce7' : '#fee2e2',
                                        color: ev.cumple ? '#166534' : '#991b1b',
                                        fontSize: '0.8rem', fontWeight: 'bold', flexShrink: 0, marginTop: '0.1rem'
                                    }}>
                                        {ev.cumple ? '✓' : '✗'}
                                    </span>
                                    <div style={{ flexGrow: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', marginBottom: '0.35rem' }}>
                                            <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.9rem', lineHeight: '1.4' }}>
                                                {ev.pregunta_texto}
                                            </span>
                                            <span style={{
                                                fontSize: '0.72rem', fontWeight: '700', padding: '0.15rem 0.5rem', borderRadius: '999px',
                                                background: ev.cumple ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                                color: ev.cumple ? '#15803d' : '#b91c1c',
                                            }}>
                                                {ev.cumple ? 'Cumple' : 'No Cumple'}
                                            </span>
                                        </div>
                                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem', lineHeight: '1.5' }}>
                                            {ev.justificacion_ia}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right column: Charts & Numeric evals & Transcript */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                        
                        {/* 4 Evaluation Charts Grid */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ background: 'white', border: '1px solid #fed7aa', borderRadius: '24px', padding: '1.5rem', boxShadow: '0 8px 20px rgba(59,29,17,0.03)' }}>
                                <h4 style={{ margin: '0 0 1rem', color: '#431407', fontSize: '1rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <IconBarChart2 /> Criterios de Evaluación
                                </h4>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>
                                    {radarData.length > 0 && (
                                        <div style={{ width: '100%', height: 200, display: 'flex', justifyContent: 'center' }}>
                                            <ResponsiveContainer>
                                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                                    <PolarGrid stroke="#fed7aa" />
                                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#431407', fontSize: 8, fontWeight: 700 }} />
                                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#7c6a5f', fontSize: 8 }} />
                                                    <Radar name="Cumplimiento" dataKey="value" stroke="#ea580c" fill="#ea580c" fillOpacity={0.35} />
                                                </RadarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        {radarData.map((r, idx) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fffbeb', padding: '0.5rem 0.85rem', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#431407' }}>{r.subject}</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: '800', color: r.value >= 80 ? '#10b981' : r.value >= 50 ? '#ea580c' : '#ef4444' }}>
                                                    {r.value}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* 3 Individual Category Charts */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                
                                {/* Chart 1: Atención al Cliente */}
                                <div style={{ background: 'white', border: '1px solid #fed7aa', borderRadius: '24px', padding: '1.5rem', boxShadow: '0 8px 20px rgba(59,29,17,0.03)' }}>
                                    <h4 style={{ margin: '0 0 1rem', color: '#431407', fontSize: '0.95rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        🛡️ Atención al Cliente
                                    </h4>
                                    {renderCategoryChart("ATENCIÓN AL CLIENTE")}
                                </div>

                                {/* Chart 2: Ventas y Sugerencias */}
                                <div style={{ background: 'white', border: '1px solid #fed7aa', borderRadius: '24px', padding: '1.5rem', boxShadow: '0 8px 20px rgba(59,29,17,0.03)' }}>
                                    <h4 style={{ margin: '0 0 1rem', color: '#431407', fontSize: '0.95rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        📈 Ventas y Sugerencias
                                    </h4>
                                    {renderCategoryChart("VENTAS Y SUGERENCIAS")}
                                </div>

                                {/* Chart 3: Marketing */}
                                <div style={{ background: 'white', border: '1px solid #fed7aa', borderRadius: '24px', padding: '1.5rem', boxShadow: '0 8px 20px rgba(59,29,17,0.03)' }}>
                                    <h4 style={{ margin: '0 0 1rem', color: '#431407', fontSize: '0.95rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        📣 Marketing y Despedida
                                    </h4>
                                    {renderCategoryChart("MARKETING")}
                                </div>
                            </div>
                        </div>

                        {/* Numeric evaluations (CSAT, ease, etc.) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {numericEvals.map((ev, idx) => {
                                const val = ev.puntaje ?? 0;
                                const maxVal = (ev.configuracion_respuesta && ev.configuracion_respuesta.max) || 10;
                                return (
                                    <div key={idx} style={{
                                        background: 'white', border: '1px solid #fed7aa', borderRadius: '20px',
                                        padding: '1.4rem 1.75rem', boxShadow: '0 8px 20px rgba(59,29,17,0.03)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                            <h4 style={{ margin: 0, color: '#431407', fontSize: '1rem', fontWeight: '800' }}>
                                                {ev.pregunta_texto}
                                            </h4>
                                            <span style={{ fontSize: '1.4rem', fontWeight: '900', color: '#ea580c' }}>
                                                {val} <span style={{ fontSize: '0.85rem', color: '#a3a3a3', fontWeight: '500' }}>/ {maxVal}</span>
                                            </span>
                                        </div>
                                        <div style={{ height: '8px', background: '#ffedd5', borderRadius: '999px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                                            <div style={{ height: '100%', background: 'linear-gradient(90deg, #f97316, #ea580c)', width: `${(val / maxVal) * 100}%`, borderRadius: '999px' }} />
                                        </div>
                                        <p style={{ margin: 0, color: '#7c6a5f', fontSize: '0.8rem', lineHeight: '1.5' }}>
                                            {ev.justificacion_ia}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Transcript */}
                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <p style={{ margin: 0, fontWeight: '700', fontSize: '0.95rem', color: '#431407' }}>
                                    Transcripción Original
                                </p>
                                <button
                                    onClick={() => setShowTranscription(!showTranscription)}
                                    style={{
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: '8px',
                                        background: '#fff',
                                        border: '1px solid #fed7aa',
                                        color: '#ea580c',
                                        fontWeight: '700',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.25rem'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#fffbeb'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                >
                                    {showTranscription ? '🙈 Ocultar Transcripción' : '👁️ Mostrar Transcripción'}
                                </button>
                            </div>
                            
                            {showTranscription && (
                                <div style={{
                                    maxHeight: '300px',
                                    overflowY: 'auto',
                                    paddingRight: '0.5rem',
                                    border: '1px solid #f1f5f9',
                                    borderRadius: '16px',
                                    padding: '1rem',
                                    background: '#fafaf9',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1rem'
                                }}>
                                    {(() => {
                                        const parsed = parseTranscriptText(atencion.texto);
                                        if (parsed.length === 0) {
                                            return (
                                                <div style={{
                                                    background: 'white', border: '1px solid #fed7aa',
                                                    borderRadius: '16px', padding: '1.25rem',
                                                    fontSize: '0.875rem', color: '#4f3e35',
                                                    lineHeight: '1.7', fontStyle: 'italic',
                                                }}>
                                                    No hay texto disponible.
                                                </div>
                                            );
                                        }
                                        const grouped = groupSegmentsBySpeaker(parsed);
                                        return grouped.map((group, gIdx) => {
                                            const isCajero = group.speaker === 'Cajero';
                                            return (
                                                <div key={gIdx} style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    background: isCajero ? '#f0f9ff' : '#fff7ed',
                                                    borderLeft: `4px solid ${isCajero ? '#0ea5e9' : '#f97316'}`,
                                                    borderRadius: '12px',
                                                    padding: '1rem',
                                                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.25rem' }}>
                                                        <span style={{
                                                            color: isCajero ? '#0369a1' : '#c2410c',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '800',
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.05em',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.4rem'
                                                        }}>
                                                            {isCajero ? '👤 Cajero (Agente)' : '👥 Usuario (Cliente)'}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                        {group.texts.map((t, tIdx) => (
                                                            <div key={tIdx} style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                                                                {t.inicio !== null && (
                                                                    <span style={{
                                                                        color: '#94a3b8',
                                                                        fontSize: '0.75rem',
                                                                        fontFamily: 'monospace',
                                                                        whiteSpace: 'nowrap',
                                                                        minWidth: '150px',
                                                                        flexShrink: 0
                                                                    }}>
                                                                        [{t.inicio.toFixed(2)}s - {t.fin.toFixed(2)}s]
                                                                    </span>
                                                                )}
                                                                <span style={{
                                                                    color: '#334155',
                                                                    fontSize: '0.92rem',
                                                                    lineHeight: '1.6',
                                                                    fontFamily: 'system-ui, -apple-system, sans-serif'
                                                                }}>
                                                                    {t.text}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* Audio Player Block */}
                        {atencion.grabacionId && (
                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <p style={{ margin: 0, fontWeight: '700', fontSize: '0.95rem', color: '#431407' }}>
                                        Grabación de Audio
                                    </p>
                                    <button
                                        onClick={() => setShowAudioPlayer(!showAudioPlayer)}
                                        style={{
                                            padding: '0.4rem 0.8rem',
                                            borderRadius: '8px',
                                            background: '#fff',
                                            border: '1px solid #fed7aa',
                                            color: '#ea580c',
                                            fontWeight: '700',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#fffbeb'}
                                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                    >
                                        {showAudioPlayer ? '🔊 Ocultar Reproductor' : '🎧 Mostrar Reproductor'}
                                    </button>
                                </div>
                                
                                {showAudioPlayer && (
                                    <div style={{
                                        border: '1px solid #fed7aa',
                                        borderRadius: '20px',
                                        padding: '1.25rem 1.5rem',
                                        background: 'linear-gradient(135deg, #fffbeb 0%, #fff7ed 100%)',
                                        boxShadow: '0 8px 24px rgba(234,88,12,0.04)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.85rem'
                                    }}>
                                        {audioUrl && (
                                            <audio
                                                ref={audioRef}
                                                src={audioUrl}
                                                onTimeUpdate={handleTimeUpdate}
                                                onLoadedMetadata={handleLoadedMetadata}
                                                onEnded={handleAudioEnded}
                                                onError={() => setAudioError("No se pudo cargar el archivo de audio. Puede que no exista aún en el servidor.")}
                                            />
                                        )}

                                        {audioError && (
                                            <div style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                ⚠️ {audioError}
                                            </div>
                                        )}

                                        {/* Progress Bar & Timestamps */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                            <input
                                                type="range"
                                                min="0"
                                                max={duration || 100}
                                                value={currentTime}
                                                onChange={handleSeek}
                                                style={{
                                                    width: '100%',
                                                    accentColor: '#ea580c',
                                                    height: '6px',
                                                    borderRadius: '999px',
                                                    cursor: 'pointer',
                                                    background: '#ffedd5',
                                                    border: 'none',
                                                    outline: 'none'
                                                }}
                                            />
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#7c6a5f', fontFamily: 'monospace', fontWeight: '600' }}>
                                                <span>{formatTime(currentTime)}</span>
                                                <span>{formatTime(duration)}</span>
                                            </div>
                                        </div>

                                        {/* Controls Bar */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                            
                                            {/* Left: Speed Rate Toggles */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                {[1, 1.25, 1.5, 2].map((rate) => (
                                                    <button
                                                        key={rate}
                                                        onClick={() => changePlaybackRate(rate)}
                                                        style={{
                                                            padding: '0.25rem 0.5rem',
                                                            borderRadius: '6px',
                                                            background: playbackRate === rate ? '#ea580c' : '#fff',
                                                            color: playbackRate === rate ? '#fff' : '#ea580c',
                                                            border: '1px solid #fed7aa',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '700',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.15s'
                                                        }}
                                                    >
                                                        {rate}x
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Center: Play/Seek buttons */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                {/* Seek -10s */}
                                                <button
                                                    onClick={skipBackward}
                                                    title="Retroceder 10 segundos"
                                                    style={{
                                                        width: '36px', height: '36px', borderRadius: '50%',
                                                        background: '#fff', border: '1px solid #fed7aa',
                                                        color: '#ea580c', display: 'flex', alignItems: 'center',
                                                        justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#ffedd5'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                                        <path d="M3 3v5h5" />
                                                        <text x="7" y="15" fontSize="8" fontWeight="bold" fill="currentColor" stroke="none">10</text>
                                                    </svg>
                                                </button>

                                                {/* Play / Pause Button */}
                                                <button
                                                    onClick={togglePlay}
                                                    style={{
                                                        width: '46px', height: '46px', borderRadius: '50%',
                                                        background: 'linear-gradient(135deg, #f97316, #ea580c)',
                                                        border: 'none', color: '#fff', display: 'flex', alignItems: 'center',
                                                        justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s',
                                                        boxShadow: '0 4px 12px rgba(234,88,12,0.3)'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                >
                                                    {isPlaying ? (
                                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                                            <rect x="6" y="4" width="4" height="16" rx="1" />
                                                            <rect x="14" y="4" width="4" height="16" rx="1" />
                                                        </svg>
                                                    ) : (
                                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'translateX(2px)' }}>
                                                            <polygon points="5 3 19 12 5 21 5 3" />
                                                        </svg>
                                                    )}
                                                </button>

                                                {/* Seek +10s */}
                                                <button
                                                    onClick={skipForward}
                                                    title="Adelantar 10 segundos"
                                                    style={{
                                                        width: '36px', height: '36px', borderRadius: '50%',
                                                        background: '#fff', border: '1px solid #fed7aa',
                                                        color: '#ea580c', display: 'flex', alignItems: 'center',
                                                        justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#ffedd5'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                                                        <path d="M21 3v5h-5" />
                                                        <text x="8" y="15" fontSize="8" fontWeight="bold" fill="currentColor" stroke="none">10</text>
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    if (inline) return innerContent;

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(59,29,17,0.4)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 11000, padding: '1.5rem',
        }}>
            {innerContent}
        </div>
    );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function CashierAtencionesModal({ cashier, onClose, inline = false }) {
    const [atenciones, setAtenciones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [analysisFilter, setAnalysisFilter] = useState('ALL');
    const [selectedAtencion, setSelectedAtencion] = useState(null);
    const [activeAnalysis, setActiveAnalysis] = useState(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);

    const loadAtenciones = async (silent = false) => {
        if (!cashier?.id) return;
        if (!silent) setLoading(true);
        try {
            const data = await getAtencionesByCajero(cashier.id);
            setAtenciones(data.map(aten => {
                const dtFin = aten.fecha_hora_fin ? new Date(aten.fecha_hora_fin) : null;
                return {
                    id: aten.id,
                    date: getEcuadorDateString(aten.fecha_hora_inicio),
                    time: getEcuadorTimeString(aten.fecha_hora_inicio),
                    timeEnd: dtFin ? getEcuadorTimeString(aten.fecha_hora_fin) : '—',
                    duration: aten.duracion_segundos
                        ? `${Math.floor(aten.duracion_segundos / 60)}m ${String(aten.duracion_segundos % 60).padStart(2,'0')}s`
                        : '—',
                    estado: aten.estado,
                    hasAnalysis: !!aten.analisis_id,
                    texto: aten.texto_transcripcion,
                    sentimiento: aten.sentimiento_general,
                    calificacion: aten.calificacion_general,
                    grabacionId: aten.grabacion_id
                };
            }));
        } catch (err) { 
            console.error("Error loading atenciones:", err); 
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        loadAtenciones(false);
        const intervalId = setInterval(() => {
            loadAtenciones(true);
        }, 5000);
        return () => clearInterval(intervalId);
    }, [cashier?.id]);

    const handleViewAnalysis = async (aten) => {
        if (!aten.hasAnalysis) return;
        setLoadingAnalysis(true);
        try {
            const data = await getAnalisisByAtencion(aten.id);
            setActiveAnalysis(data);
            setSelectedAtencion(aten);
        } catch (err) { console.error(err); }
        setLoadingAnalysis(false);
    };

    const filtered = atenciones.filter(a => {
        if (dateFilter && a.date !== dateFilter) return false;
        if (statusFilter !== 'ALL' && a.estado !== statusFilter) return false;
        if (analysisFilter !== 'ALL') {
            if (analysisFilter === 'ANALYZED' && !a.hasAnalysis) return false;
            if (analysisFilter === 'PENDING' && a.hasAnalysis) return false;
        }
        return true;
    });

    const completadas = atenciones.filter(a => a.estado === 'COMPLETADA').length;
    const conAnalisis = atenciones.filter(a => a.hasAnalysis).length;

    if (!cashier) return null;

    const cashierName = cashier.contacto
        ? `${cashier.contacto.nombre} ${cashier.contacto.apellido}`
        : cashier.username;
    const initials = cashier.username?.slice(0, 2).toUpperCase() || 'CA';

    if (inline && selectedAtencion && activeAnalysis) {
        return (
            <AnalysisModal
                analysis={activeAnalysis}
                atencion={selectedAtencion}
                onClose={() => { setSelectedAtencion(null); setActiveAnalysis(null); }}
                inline={true}
            />
        );
    }

    const mainContainerStyle = {
        background: '#f8fafc', width: '100%',
        borderRadius: '28px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: inline ? 'none' : '0 40px 80px -16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.6)',
        border: inline ? '1px solid #fed7aa' : 'none',
        height: inline ? 'auto' : '90vh',
        minHeight: inline ? '650px' : 'auto',
    };

    const mainContent = (
        <div style={mainContainerStyle}>
            <style>{`
                @keyframes modalIn {
                    from { opacity:0; transform:translateY(20px) scale(0.97); }
                    to   { opacity:1; transform:translateY(0) scale(1); }
                }
                @keyframes cardReveal {
                    from { opacity:0; transform:translateY(12px); }
                    to   { opacity:1; transform:translateY(0); }
                }
                .aten-card:hover { transform:translateY(-3px) !important; box-shadow:0 16px 32px -6px rgba(234,88,12,0.15) !important; border-color:#fed7aa !important; }
                .filter-btn { transition:all 0.18s ease; }
                .filter-btn:hover:not(.active) { border-color:#94a3b8 !important; color:#475569 !important; }
            `}</style>

            {/* ── HERO HEADER ── */}
            <div style={{
                background: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 60%, #ea580c 100%)',
                padding: '1.75rem 2.25rem', flexShrink: 0, position: 'relative', overflow: 'hidden',
            }}>
                <div style={{ position: 'absolute', right: '-40px', top: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', right: '100px', bottom: '-60px', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1, position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        <div style={{
                            width: '60px', height: '60px', borderRadius: '18px',
                            background: 'rgba(255,255,255,0.18)',
                            border: '2px solid rgba(255,255,255,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontWeight: '900', fontSize: '1.3rem', letterSpacing: '-0.02em',
                        }}>{initials}</div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                                <h2 style={{ margin: 0, color: 'white', fontWeight: '800', fontSize: '1.45rem', letterSpacing: '-0.025em' }}>
                                    Atenciones al Cliente
                                </h2>
                                <span style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', color: 'white', fontSize: '0.7rem', fontWeight: '700', padding: '0.15rem 0.55rem', borderRadius: '999px' }}>
                                    {atenciones.length} registros
                                </span>
                            </div>
                            <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
                                Cajero: <strong style={{ color: 'white' }}>{cashierName}</strong>
                            </p>
                        </div>
                    </div>

                    {/* Stats chips */}
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        {[
                            { label: 'Completadas', value: completadas, color: '#22c55e' },
                            { label: 'Con Análisis', value: conAnalisis, color: '#fb923c' },
                        ].map(s => (
                            <div key={s.label} style={{
                                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
                                borderRadius: '14px', padding: '0.65rem 1rem', textAlign: 'center',
                                backdropFilter: 'blur(8px)',
                            }}>
                                <div style={{ fontSize: '1.4rem', fontWeight: '900', color: 'white', lineHeight: 1 }}>{s.value}</div>
                                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.6)', marginTop: '0.2rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                            </div>
                        ))}
                        <button onClick={onClose} style={{
                            background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: '12px', padding: inline ? '0.6rem 1.2rem' : '0.6rem', cursor: 'pointer',
                            color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '700',
                            fontSize: '0.85rem', transition: 'all 0.15s',
                        }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.28)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
                        >
                            {inline ? '← Volver a Cajeros' : <IconX />}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── FILTER BAR ── */}
            <div style={{
                padding: '1rem 2.25rem', background: 'white',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap',
            }}>
                {/* Date filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ display: 'flex', color: '#94a3b8' }}><IconCalendar /></span>
                    <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{
                        padding: '0.45rem 0.75rem', borderRadius: '10px', border: '1.5px solid #e2e8f0',
                        fontSize: '0.83rem', color: '#475569', outline: 'none', fontFamily: 'inherit',
                        transition: 'border-color 0.15s',
                    }}
                        onFocus={e => e.target.style.borderColor = '#f97316'}
                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                    />
                    {dateFilter && <button onClick={() => setDateFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.8rem', padding: '0.2rem 0.3rem' }}>✕</button>}
                </div>

                <div style={{ width: '1px', height: '20px', background: '#e2e8f0', flexShrink: 0 }} />

                {/* Status filters */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ display: 'flex', color: '#94a3b8' }}><IconFilter /></span>
                    {[['ALL','Todos'],['COMPLETADA','Completadas'],['EN_PROCESO','En Proceso']].map(([val, label]) => (
                        <button key={val} className={`filter-btn ${statusFilter === val ? 'active' : ''}`}
                            onClick={() => setStatusFilter(val)}
                            style={{
                                padding: '0.4rem 0.85rem', borderRadius: '10px', fontSize: '0.8rem',
                                fontWeight: statusFilter === val ? '700' : '500', cursor: 'pointer',
                                border: `1.5px solid ${statusFilter === val ? '#ea580c' : '#e2e8f0'}`,
                                background: statusFilter === val ? '#ea580c' : 'white',
                                color: statusFilter === val ? 'white' : '#64748b',
                            }}>
                            {label}
                        </button>
                    ))}
                </div>

                <div style={{ width: '1px', height: '20px', background: '#e2e8f0', flexShrink: 0 }} />

                {/* Analysis filters */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ display: 'flex', color: '#94a3b8' }}><IconBarChart2 /></span>
                    {[['ALL','Todos'],['ANALYZED','Con Análisis'],['PENDING','Pendientes']].map(([val, label]) => (
                        <button key={val} className={`filter-btn ${analysisFilter === val ? 'active' : ''}`}
                            onClick={() => setAnalysisFilter(val)}
                            style={{
                                padding: '0.4rem 0.85rem', borderRadius: '10px', fontSize: '0.8rem',
                                fontWeight: analysisFilter === val ? '700' : '500', cursor: 'pointer',
                                border: `1.5px solid ${analysisFilter === val ? '#ea580c' : '#e2e8f0'}`,
                                background: analysisFilter === val ? '#ea580c' : 'white',
                                color: analysisFilter === val ? 'white' : '#64748b',
                            }}>
                            {label}
                        </button>
                    ))}
                </div>

                <div style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#94a3b8', fontWeight: '600' }}>
                    {filtered.length} de {atenciones.length} atenciones
                </div>
            </div>

            {/* ── CONTENT GRID ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 2.25rem' }}>
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', color: '#94a3b8' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: '4px solid #f1f5f9', borderTopColor: '#ea580c', animation: 'spin 0.8s linear infinite' }} />
                        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
                        <p style={{ margin: 0, fontWeight: '600', fontSize: '0.95rem' }}>Cargando atenciones...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem' }}>
                        <div style={{ width: '80px', height: '80px', borderRadius: '24px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}>📭</div>
                        <p style={{ margin: 0, fontWeight: '700', fontSize: '1.05rem', color: '#1e293b' }}>Sin atenciones registradas</p>
                        <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>Intenta ajustar los filtros para ver más resultados</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {filtered.map((aten, idx) => {
                            const isCompleted = aten.estado === 'COMPLETADA';
                            return (
                                <div key={aten.id} style={{
                                    background: 'white', borderRadius: '16px',
                                    border: '1.5px solid #f1f5f9',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '1rem 1.5rem', gap: '1.5rem',
                                    transition: 'all 0.2s ease',
                                    animation: `cardReveal 0.3s ease ${idx * 0.03}s both`,
                                }}
                                className="aten-list-row"
                                >
                                    {/* Left Accent Bar */}
                                    <div style={{
                                        width: '4px', height: '40px', borderRadius: '2px',
                                        background: isCompleted ? '#22c55e' : '#f59e0b',
                                        flexShrink: 0
                                    }} />

                                    {/* Date & Time */}
                                    <div style={{ minWidth: '170px', flexShrink: 0 }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>
                                            {aten.date}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                                            <span style={{ fontSize: '1rem', fontWeight: '800', color: '#1e293b' }}>{aten.time}</span>
                                            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>➔</span>
                                            <span style={{ fontSize: '1rem', fontWeight: '800', color: '#1e293b' }}>{aten.timeEnd}</span>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            Duración: <strong style={{ color: '#ea580c' }}>{aten.duration}</strong>
                                        </span>
                                    </div>

                                    {/* Transcript preview */}
                                    <div style={{ flexGrow: 1, minWidth: '200px' }}>
                                        {aten.texto ? (
                                            <p style={{
                                                margin: 0, fontSize: '0.82rem', color: '#64748b',
                                                lineHeight: '1.4', fontStyle: 'italic',
                                                whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden',
                                                background: '#f8fafc', padding: '0.5rem 0.75rem',
                                                borderRadius: '8px', border: '1px solid #f1f5f9',
                                                maxWidth: '500px'
                                            }}>
                                                "{aten.texto}"
                                            </p>
                                        ) : (
                                            <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic' }}>Sin transcripción</span>
                                        )}
                                    </div>

                                    {/* Badges Column */}
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, minWidth: '225px', justifyContent: 'flex-end' }}>
                                        <span style={{
                                            padding: '0.25rem 0.55rem', borderRadius: '8px',
                                            fontSize: '0.68rem', fontWeight: '800',
                                            background: isCompleted ? '#f0fdf4' : '#fffbeb',
                                            color: isCompleted ? '#15803d' : '#b45309',
                                            border: `1px solid ${isCompleted ? '#bbf7d0' : '#fcd34d'}`,
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {isCompleted ? '✓ Completada' : '⏳ En proceso'}
                                        </span>

                                        {aten.hasAnalysis && (
                                            <>
                                                {aten.sentimiento && (
                                                    <span style={{
                                                        padding: '0.2rem 0.45rem',
                                                        borderRadius: '8px',
                                                        fontSize: '0.65rem',
                                                        fontWeight: '800',
                                                        background: aten.sentimiento === 'POSITIVO' ? '#dcfce7' : aten.sentimiento === 'NEGATIVO' ? '#fee2e2' : '#f1f5f9',
                                                        color: aten.sentimiento === 'POSITIVO' ? '#15803d' : aten.sentimiento === 'NEGATIVO' ? '#991b1b' : '#475569',
                                                        border: `1px solid ${aten.sentimiento === 'POSITIVO' ? '#bbf7d0' : aten.sentimiento === 'NEGATIVO' ? '#fecaca' : '#cbd5e1'}`,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.15rem'
                                                    }}>
                                                        {aten.sentimiento === 'POSITIVO' ? '😊' : aten.sentimiento === 'NEGATIVO' ? '😞' : '😐'} {aten.sentimiento}
                                                    </span>
                                                )}
                                                {aten.calificacion !== undefined && aten.calificacion !== null && (
                                                    <span style={{
                                                        padding: '0.2rem 0.45rem',
                                                        borderRadius: '8px',
                                                        fontSize: '0.65rem',
                                                        fontWeight: '800',
                                                        background: aten.calificacion >= 80 ? '#ecfdf5' : aten.calificacion >= 50 ? '#fffbeb' : '#fef2f2',
                                                        color: aten.calificacion >= 80 ? '#047857' : aten.calificacion >= 50 ? '#b45309' : '#b91c1c',
                                                        border: `1px solid ${aten.calificacion >= 80 ? '#a7f3d0' : aten.calificacion >= 50 ? '#fde68a' : '#fecaca'}`,
                                                    }}>
                                                        ★ {aten.calificacion}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* Action Button */}
                                    <div style={{ flexShrink: 0 }}>
                                        {aten.hasAnalysis ? (
                                            <button
                                                onClick={() => handleViewAnalysis(aten)}
                                                disabled={loadingAnalysis}
                                                style={{
                                                    padding: '0.5rem 0.9rem', borderRadius: '10px',
                                                    background: 'linear-gradient(135deg, #ea580c, #c2410c)',
                                                    color: 'white', border: 'none', fontWeight: '700',
                                                    fontSize: '0.8rem', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                                                    boxShadow: '0 3px 10px rgba(234,88,12,0.2)',
                                                    transition: 'all 0.15s',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                            >
                                                <IconBarChart2 />
                                                {loadingAnalysis ? '...' : 'Ver Calificación & Análisis'}
                                                <IconChevronRight />
                                            </button>
                                        ) : (
                                            <div style={{
                                                padding: '0.5rem 0.9rem', borderRadius: '10px',
                                                background: '#f8fafc', border: '1px dashed #cbd5e1',
                                                color: '#94a3b8', fontSize: '0.78rem', fontWeight: '600',
                                                textAlign: 'center', minWidth: '110px'
                                            }}>
                                                ⏳ Pendiente
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );

    if (inline) return mainContent;

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(2,6,23,0.65)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '1.5rem',
        }}>
            {mainContent}

            {/* Nested analysis modal */}
            {selectedAtencion && activeAnalysis && (
                <AnalysisModal
                    analysis={activeAnalysis}
                    atencion={selectedAtencion}
                    onClose={() => { setSelectedAtencion(null); setActiveAnalysis(null); }}
                />
            )}
        </div>
    );
}
