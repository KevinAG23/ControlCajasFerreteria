import React from 'react';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Label
} from 'recharts';

export const SentimentPieChart = ({ recordings = [] }) => {
    const data = React.useMemo(() => {
        let pos = 0, neu = 0, neg = 0;
        recordings.forEach(r => {
            const s = r.analisis?.sentimiento_general || 'Neutral';
            if (s === 'Positivo') pos++;
            else if (s === 'Negativo') neg++;
            else neu++;
        });
        const total = pos + neu + neg || 1;
        return [
            { name: 'Positivo', value: Math.round((pos / total) * 100), color: '#10b981' },
            { name: 'Neutral', value: Math.round((neu / total) * 100), color: '#f59e0b' },
            { name: 'Negativo', value: Math.round((neg / total) * 100), color: '#ef4444' },
        ];
    }, [recordings]);

    return (
        <div style={{ width: '100%', height: 350, background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' }}>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1.2rem', color: '#1f2937', fontWeight: '600', textAlign: 'center' }}>Distribución de Sentimientos</h3>
            <div style={{ height: 280, width: '100%' }}>
                <ResponsiveContainer>
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={90}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                            <Label
                                value="Total: 100%"
                                position="center"
                                className='label-top'
                                fontSize='14px'
                                fontWeight="bold"
                                fill="#374151"
                            />
                        </Pie>
                        <Tooltip
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                            itemStyle={{ fontWeight: '500' }}
                        />
                        <Legend
                            verticalAlign="bottom"
                            height={36}
                            iconType="circle"
                            formatter={(value) => <span style={{ color: '#4b5563', fontWeight: '500', marginLeft: '5px' }}>{value}</span>}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export const ActivityBarChart = ({ recordings = [] }) => {
    const data = React.useMemo(() => {
        const hours = { '08:00': 0, '10:00': 0, '12:00': 0, '14:00': 0, '16:00': 0, '18:00': 0 };
        recordings.forEach(r => {
            if (!r.hora) return;
            const hour = parseInt(r.hora.split(':')[0], 10);
            if (hour >= 8 && hour < 10) hours['08:00']++;
            else if (hour >= 10 && hour < 12) hours['10:00']++;
            else if (hour >= 12 && hour < 14) hours['12:00']++;
            else if (hour >= 14 && hour < 16) hours['14:00']++;
            else if (hour >= 16 && hour < 18) hours['16:00']++;
            else if (hour >= 18) hours['18:00']++;
        });
        return Object.keys(hours).map(k => ({ name: k, recordings: hours[k] }));
    }, [recordings]);

    return (
        <div style={{ width: '100%', height: 350, background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem', color: '#1f2937', fontWeight: '600', textAlign: 'center' }}>Actividad Diaria</h3>
            <div style={{ height: 260, width: '100%' }}>
                <ResponsiveContainer>
                    <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorRecordings" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.2} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: '500' }}
                            dy={10}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: '500' }}
                        />
                        <Tooltip
                            cursor={{ fill: '#f9fafb' }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', background: 'rgba(255, 255, 255, 0.95)' }}
                        />
                        <Bar
                            dataKey="recordings"
                            fill="url(#colorRecordings)"
                            radius={[8, 8, 0, 0]}
                            barSize={32}
                            name="Grabaciones"
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
