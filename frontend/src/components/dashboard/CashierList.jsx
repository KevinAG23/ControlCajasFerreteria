import React, { useState } from 'react';

// AVATAR PALETTES FOR PROFESSIONAL GRADIENTS
const AVATAR_PALETTES = [
    { from: '#6366f1', to: '#8b5cf6', ring: 'rgba(99,102,241,0.2)' },
    { from: '#0ea5e9', to: '#2563eb', ring: 'rgba(14,165,233,0.2)' },
    { from: '#10b981', to: '#059669', ring: 'rgba(16,185,129,0.2)' },
    { from: '#f59e0b', to: '#d97706', ring: 'rgba(245,158,11,0.2)' },
    { from: '#ec4899', to: '#db2777', ring: 'rgba(236,72,153,0.2)' },
    { from: '#14b8a6', to: '#0d9488', ring: 'rgba(20,184,166,0.2)' },
];

const getPalette = (name = '') => {
    const code = name ? name.charCodeAt(0) : 0;
    return AVATAR_PALETTES[code % AVATAR_PALETTES.length];
};

const getInitials = (name = '') => (name || '??').slice(0, 2).toUpperCase();

// SVG Icons
const IconSearch = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
);
const IconX = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
);
const IconUsers = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
);
const IconHeadset = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
    </svg>
);
const IconFileText = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
);
const IconMonitor = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
);

// Helper to determine user status styles
const getStatusDetails = (activo, en_uso) => {
    if (!activo) {
        return {
            text: 'Inactivo',
            color: '#64748b',
            bg: '#f1f5f9',
            border: '#e2e8f0',
            dot: '#94a3b8'
        };
    }
    if (en_uso) {
        return {
            text: 'En Caja',
            color: '#ea580c',
            bg: '#fff7ed',
            border: '#fed7aa',
            dot: '#ea580c',
            pulse: true
        };
    }
    return {
        text: 'Disponible',
        color: '#15803d',
        bg: '#f0fdf4',
        border: '#bbf7d0',
        dot: '#22c55e'
    };
};

// ─── LIST VIEW ROW COMPONENT ───
function CashierRow({ user, index, recordings, onViewAtenciones }) {
    const [hov, setHov] = useState(false);
    const pal = getPalette(user.username);
    const fullName = user.contacto ? `${user.contacto.nombre} ${user.contacto.apellido}` : "Sin nombre completo";
    const email = user.contacto?.email || "Sin correo asignado";

    // Calculate statistics
    const userRecordings = recordings.filter(r => r.contacto_id === user.id || (user.user_id && r.usuario_id === user.user_id));
    const totalRecordings = userRecordings.length;
    const latestCaja = userRecordings.length > 0 ? userRecordings[0].caja : null;

    const status = getStatusDetails(user.activo, user.en_uso);

    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                background: 'white',
                borderRadius: '16px',
                border: hov ? '1.5px solid #fb923c' : '1.5px solid #e2e8f0',
                padding: '0.85rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1.5rem',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: hov ? 'translateX(4px)' : 'none',
                boxShadow: hov ? '0 10px 20px -5px rgba(234,88,12,0.06), 0 4px 6px -2px rgba(0,0,0,0.01)' : '0 2px 4px rgba(0,0,0,0.005)',
                position: 'relative',
                animation: `rowIn 0.3s cubic-bezier(.4,0,.2,1) ${index * 0.03}s both`,
                boxSizing: 'border-box',
                flexWrap: 'wrap'
            }}
        >
            {/* Left Accent Bar */}
            <div style={{
                position: 'absolute', top: '15%', bottom: '15%', left: 0, width: '4px', borderRadius: '0 4px 4px 0',
                background: `linear-gradient(180deg, ${pal.from}, ${pal.to})`
            }} />

            {/* Profile + Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '2 1 250px', minWidth: '200px' }}>
                <div style={{
                    width: '46px', height: '46px', borderRadius: '14px',
                    background: `linear-gradient(135deg, ${pal.from}, ${pal.to})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontWeight: '800', fontSize: '1.05rem',
                    flexShrink: 0,
                    boxShadow: hov ? `0 4px 12px ${pal.ring}` : 'none',
                    transition: 'all 0.3s ease',
                }}>
                    {getInitials(user.username)}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '800', fontSize: '0.95rem', color: '#0f172a' }}>{user.username}</span>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            background: status.bg,
                            color: status.color,
                            border: `1px solid ${status.border}`,
                            borderRadius: '999px',
                            padding: '0.05rem 0.4rem',
                            fontSize: '0.6rem',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em'
                        }}>
                            <span style={{
                                width: '5px',
                                height: '5px',
                                borderRadius: '50%',
                                background: status.dot,
                                display: 'inline-block',
                                animation: status.pulse ? 'pulse-ring 1.5s infinite' : 'none'
                            }} />
                            {status.text}
                        </div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {fullName} • <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace, sans-serif' }}>{email}</span>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flex: '1 1 200px', minWidth: '150px' }}>
                <div style={{ flex: '1 1 50%', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#ea580c', display: 'flex', background: '#fff7ed', padding: '0.4rem', borderRadius: '8px' }}><IconFileText /></span>
                    <span style={{ fontSize: '1.05rem', fontWeight: '800', color: '#1e293b' }}>
                        {totalRecordings}
                    </span>
                </div>
                <div style={{ flex: '1 1 50%', display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    <span style={{ color: latestCaja ? '#0284c7' : '#94a3b8', display: 'flex', background: latestCaja ? '#f0f9ff' : '#f1f5f9', padding: '0.4rem', borderRadius: '8px' }}><IconMonitor /></span>
                    <span style={{
                        fontSize: '0.9rem',
                        fontWeight: '700',
                        color: latestCaja ? '#0f172a' : '#94a3b8',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {latestCaja || 'Ninguna'}
                    </span>
                </div>
            </div>

            {/* Action button */}
            <div style={{ flexShrink: 0, width: '140px', display: 'flex', justifyContent: 'center' }}>
                <button
                    onClick={() => onViewAtenciones && onViewAtenciones(user)}
                    style={{
                        width: '100%',
                        padding: '0.55rem 1rem',
                        borderRadius: '10px',
                        background: '#f0fdf4',
                        border: '1.5px solid #bbf7d0',
                        color: '#15803d',
                        fontWeight: '800',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        transition: 'all 0.18s ease',
                        boxSizing: 'border-box'
                    }}
                    onMouseEnter={e => { 
                        e.currentTarget.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'; 
                        e.currentTarget.style.color = 'white'; 
                        e.currentTarget.style.borderColor = '#16a34a'; 
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(34,197,94,0.2)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={e => { 
                        e.currentTarget.style.background = '#f0fdf4'; 
                        e.currentTarget.style.color = '#15803d'; 
                        e.currentTarget.style.borderColor = '#bbf7d0';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.transform = 'none';
                    }}
                >
                    <IconHeadset /> Ver Atenciones
                </button>
            </div>
        </div>
    );
}

// ─── MAIN CASHIER LIST CONTAINER ───
export default function CashierList({ contacts = [], users = [], boxes = [], recordings = [], onViewAtenciones }) {
    const cashierContacts = contacts.filter(c => c.rol?.toLowerCase() === 'cajero');

    const cashiers = cashierContacts.map(c => {
        const userObj = users.find(u => u.contacto_id === c.id);
        const isAssignedBoxInUse = boxes.some(b => b.assignedContactId === c.id && b.en_uso);
        
        return {
            id: c.id,
            username: userObj ? userObj.username : `${c.nombre || ''}_${c.apellido || ''}`.replace(/[\s_]+/g, '_').toLowerCase() || "cajero",
            activo: userObj ? userObj.activo : true,
            en_uso: userObj ? userObj.en_uso : isAssignedBoxInUse,
            contacto: c,
            user_id: userObj ? userObj.id : null
        };
    });

    const [search, setSearch] = useState('');
    const [focused, setFocused] = useState(false);

    const filtered = cashiers.filter(u => {
        const q = search.toLowerCase();
        return (
            u.username?.toLowerCase().includes(q) ||
            u.contacto?.nombre?.toLowerCase().includes(q) ||
            u.contacto?.apellido?.toLowerCase().includes(q)
        );
    });

    const total = cashiers.length;
    const active = cashiers.filter(u => u.activo).length;
    const onShift = cashiers.filter(u => u.en_uso && u.activo).length;

    return (
        <div style={{ animation: 'fadeSlide 0.4s ease both' }}>
            <style>{`
                @keyframes rowIn {
                    from { opacity: 0; transform: translateX(-12px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
                @keyframes fadeSlide {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes pulse-ring {
                    0% {
                        box-shadow: 0 0 0 0 rgba(234, 88, 12, 0.4);
                    }
                    70% {
                        box-shadow: 0 0 0 6px rgba(234, 88, 12, 0);
                    }
                    100% {
                        box-shadow: 0 0 0 0 rgba(234, 88, 12, 0);
                    }
                }
                @keyframes float-1 {
                    0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0.04; }
                    50%      { transform: translateY(-15px) rotate(10deg); opacity: 0.08; }
                }
                @keyframes float-2 {
                    0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0.03; }
                    50%      { transform: translateY(-10px) rotate(-8deg); opacity: 0.06; }
                }
            `}</style>

            {/* ── HEADER BANNER ── */}
            <div style={{
                background: 'linear-gradient(135deg, #7c2d12 0%, #9a3412 30%, #c2410c 65%, #ea580c 100%)',
                borderRadius: '24px', padding: '2rem 2.25rem', marginBottom: '1.75rem',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem',
                boxShadow: '0 16px 40px -8px rgba(194,65,12,0.3), 0 4px 12px -2px rgba(0,0,0,0.1)',
                position: 'relative', overflow: 'hidden',
            }}>
                {/* Floating decorative elements */}
                <div style={{ position: 'absolute', right: '-30px', top: '-30px', width: '180px', height: '180px', borderRadius: '50%', background: 'white', animation: 'float-1 6s ease-in-out infinite', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', right: '120px', bottom: '-50px', width: '130px', height: '130px', borderRadius: '50%', background: 'white', animation: 'float-2 8s ease-in-out infinite', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', left: '40%', top: '-20px', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', zIndex: 1 }}>
                    <div style={{
                        width: '60px', height: '60px', borderRadius: '18px',
                        background: 'rgba(255,255,255,0.12)',
                        border: '1.5px solid rgba(255,255,255,0.2)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white',
                    }}>
                        <IconUsers />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, color: 'white', fontWeight: '800', fontSize: '1.55rem', letterSpacing: '-0.03em' }}>
                            Análisis de Cajeros
                        </h1>
                        <p style={{ margin: '0.2rem 0 0', color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', fontWeight: '400' }}>
                            Supervisión y desempeño del personal activo
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', zIndex: 1, flexWrap: 'wrap' }}>
                    {[
                        { label: 'Total', value: total, icon: '👥' },
                        { label: 'Activos', value: active, icon: '✅' },
                        { label: 'En Turno', value: onShift, icon: '💼', color: '#ffedd5' },
                    ].map(stat => (
                        <div key={stat.label} style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '16px', padding: '0.75rem 1.25rem',
                            backdropFilter: 'blur(8px)', textAlign: 'center', minWidth: '90px',
                            boxSizing: 'border-box'
                        }}>
                            <div style={{ fontSize: '0.95rem', marginBottom: '0.15rem' }}>{stat.icon}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: '900', color: stat.color || 'white', lineHeight: 1 }}>{stat.value}</div>
                            <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.6)', marginTop: '0.25rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── SEARCH & COUNT ROW ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {/* Search bar */}
                <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
                    <span style={{
                        position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
                        color: focused ? '#ea580c' : '#94a3b8', transition: 'color 0.2s',
                        display: 'flex', alignItems: 'center',
                    }}>
                        <IconSearch />
                    </span>
                    <input
                        type="text"
                        placeholder="Buscar cajero por nombre o usuario..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            padding: '0.75rem 1rem 0.75rem 2.75rem',
                            borderRadius: '14px',
                            border: `2px solid ${focused ? '#fb923c' : '#e2e8f0'}`,
                            background: 'white',
                            fontSize: '0.88rem', color: '#1e293b',
                            outline: 'none', fontFamily: 'inherit',
                            boxShadow: focused ? '0 0 0 4px rgba(251,146,60,0.12)' : '0 2px 8px rgba(0,0,0,0.02)',
                            transition: 'all 0.2s ease',
                        }}
                    />
                    {search && (
                        <button onClick={() => setSearch('')} style={{
                            position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)',
                            background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b',
                            borderRadius: '50%', width: '22px', height: '22px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <IconX />
                        </button>
                    )}
                </div>

                {/* Counter */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{
                        background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '12px',
                        padding: '0.6rem 1rem', fontSize: '0.82rem', color: '#64748b',
                        fontWeight: '600', whiteSpace: 'nowrap',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.01)',
                    }}>
                        {filtered.length} de {total} cajeros
                    </div>
                </div>
            </div>

            {/* ── MAIN RENDER (STRICT LIST) ── */}
            {filtered.length > 0 ? (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    padding: '0.25rem 0',
                }}>
                    {/* Table Column Headers */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1.5rem',
                        padding: '0.75rem 1.5rem',
                        color: '#64748b',
                        fontSize: '0.72rem',
                        fontWeight: '800',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        borderBottom: '2px solid #f1f5f9',
                        marginBottom: '0.25rem',
                        boxSizing: 'border-box'
                    }}>
                        <div style={{ flex: '2 1 250px', minWidth: '200px', paddingLeft: '3.8rem' }}>Cajero / Estado</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flex: '1 1 200px', minWidth: '150px' }}>
                            <div style={{ flex: '1 1 50%' }}>Grabaciones</div>
                            <div style={{ flex: '1 1 50%' }}>Última Caja</div>
                        </div>
                        <div style={{ width: '140px', flexShrink: 0, textAlign: 'center' }}>Acciones</div>
                    </div>

                    {filtered.map((user, i) => (
                        <CashierRow
                            key={user.id}
                            user={user}
                            index={i}
                            recordings={recordings}
                            onViewAtenciones={onViewAtenciones}
                        />
                    ))}
                </div>
            ) : (
                <div style={{
                    textAlign: 'center', padding: '5rem 2rem',
                    background: 'white', borderRadius: '20px', border: '1.5px solid #e2e8f0',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.01)'
                }}>
                    <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🔍</div>
                    <p style={{ fontSize: '1.05rem', fontWeight: '700', color: '#1e293b', margin: '0 0 0.5rem' }}>
                        {search ? 'Sin resultados' : 'No hay cajeros registrados'}
                    </p>
                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>
                        {search ? `No se encontró "${search}"` : 'Añade cajeros desde la sección de Personal'}
                    </p>
                </div>
            )}
        </div>
    );
}
