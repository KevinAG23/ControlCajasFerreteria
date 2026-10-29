import React, { useEffect, useState } from "react";
import { getCostReport } from "../../api/admin";

export default function CostReportModal({ onClose }) {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await getCostReport();
        // Sort by newest first
        const sorted = data.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        setReportData(sorted);
      } catch (error) {
        console.error("Error al obtener el reporte:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const totalTokens = reportData.reduce((acc, curr) => acc + (curr.tokens_estimados || 0), 0);
  const totalCost = reportData.reduce((acc, curr) => acc + (curr.costo_usd || 0), 0);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ display: 'flex', zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', width: '90%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
        
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: '12px 12px 0 0' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', color: '#0f172a' }}>
            <span>💰</span> Reporte de Costos IA
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
        </div>

        <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Cargando métricas...</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{ background: '#ecfdf5', padding: '1.5rem', borderRadius: '12px', border: '1px solid #a7f3d0' }}>
                  <p style={{ margin: '0 0 0.5rem 0', color: '#059669', fontSize: '0.875rem', fontWeight: '600', textTransform: 'uppercase' }}>Costo Total USD</p>
                  <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#047857' }}>${totalCost.toFixed(4)}</p>
                </div>
                <div style={{ background: '#eff6ff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                  <p style={{ margin: '0 0 0.5rem 0', color: '#2563eb', fontSize: '0.875rem', fontWeight: '600', textTransform: 'uppercase' }}>Tokens Totales</p>
                  <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#1d4ed8' }}>{totalTokens.toLocaleString()}</p>
                </div>
                <div style={{ background: '#fef2f2', padding: '1.5rem', borderRadius: '12px', border: '1px solid #fecaca' }}>
                  <p style={{ margin: '0 0 0.5rem 0', color: '#dc2626', fontSize: '0.875rem', fontWeight: '600', textTransform: 'uppercase' }}>Llamadas a IA</p>
                  <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#b91c1c' }}>{reportData.length}</p>
                </div>
              </div>

              <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead style={{ background: '#f1f5f9' }}>
                    <tr>
                      <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '600' }}>Fecha</th>
                      <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '600' }}>Proveedor</th>
                      <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '600' }}>Tokens</th>
                      <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '600' }}>Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                          {new Date(row.fecha).toLocaleString('es-EC')}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{ 
                            background: row.proveedor?.includes('GROQ') ? '#fef3c7' : '#e0e7ff', 
                            color: row.proveedor?.includes('GROQ') ? '#b45309' : '#3730a3',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: '600'
                          }}>
                            {row.proveedor}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#334155', fontWeight: '500' }}>
                          {row.tokens_estimados?.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#059669', fontWeight: '600' }}>
                          ${row.costo_usd?.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                    {reportData.length === 0 && (
                      <tr>
                        <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                          Aún no hay reportes de consumo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
