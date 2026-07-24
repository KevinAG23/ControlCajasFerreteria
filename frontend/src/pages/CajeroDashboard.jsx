import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { abrirSesion, cerrarSesion } from "../api/sesiones";
import { useCustomDialog } from "../components/common/CustomDialog";
import "../styles/dashboard.css";

export default function CajeroDashboard({ user }) {
  const navigate = useNavigate();
  const { alert } = useCustomDialog();
  const [recordingState, setRecordingState] = useState("stopped"); // stopped, recording, paused
  const [sesionInfo, setSesionInfo] = useState(null);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let interval;
    if (recordingState === "recording") {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [recordingState]);

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStart = async () => {
    try {
      const s = await abrirSesion(user.username, user.caja_asignada);
      setRecordingState("recording");
      setSesionInfo(s);
      setTimer(0);
    } catch (error) {
      console.error("Error al abrir sesión:", error);
      await alert({ type: "error", message: "Error al iniciar grabación" });
    }
  };

  const handlePause = () => {
    setRecordingState("paused");
  };

  const handleResume = () => {
    setRecordingState("recording");
  };

  const handleStop = async () => {
    try {
      const s = await cerrarSesion(user.username, user.caja_asignada);
      setRecordingState("stopped");
      setSesionInfo(s);
      setTimer(0);
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      await alert({ type: "error", message: "Error al detener grabación" });
    }
  };

  const handleLogout = () => {
    navigate("/login");
    window.location.reload();
  };

  return (
    <div className="layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Cajero Panel</h2>
        </div>

        <nav className="menu">
          <a href="#" className="menu-item active">
            <span className="icon">🎙</span> Grabación
          </a>
          <a href="#" className="menu-item">
            <span className="icon">💾</span> Mis transcripciones
          </a>
        </nav>

        <div className="sidebar-footer">
          <p>Usuario: {user?.username}</p>
          <button
            onClick={handleLogout}
            className="btn-logout"
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '0.5rem',
              cursor: 'pointer',
              background: 'none',
              border: '1px solid var(--danger-color)',
              color: 'var(--danger-color)',
              borderRadius: 'var(--radius-md)',
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = 'var(--danger-color)'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* CONTENT */}
      <main className="layout-content">
        <header className="content-header">
          <h1>Panel de Grabación</h1>
          <p className="subtitle">
            Caja asignada: <strong>{user.caja_asignada ? `Caja ${user.caja_asignada}` : "Sin Asignar"}</strong>
          </p>
        </header>

        <div className="card center-card">
          <h2>Control de Grabación</h2>

          {/* Status Indicator */}
          <div className={`recording-status ${recordingState === "recording" ? "text-success" :
              recordingState === "paused" ? "text-warning" :
                "text-danger"
            }`}>
            {recordingState === "recording" ? "● GRABANDO" :
              recordingState === "paused" ? "❚❚ PAUSADO" :
                "⬛ DETENIDO"}
          </div>

          {/* Timer Display */}
          <div className="timer-display" style={{
            fontSize: '4rem',
            fontFamily: 'monospace',
            margin: '2rem 0',
            color: 'var(--text-primary)',
            fontWeight: '700',
            letterSpacing: '0.1em'
          }}>
            {formatTime(timer)}
          </div>

          {/* Control Buttons */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {recordingState === "stopped" && (
              <button
                className="big-toggle btn-record"
                onClick={handleStart}
                style={{ minWidth: '200px' }}
              >
                ▶️ Iniciar Grabación
              </button>
            )}

            {recordingState === "recording" && (
              <>
                <button
                  className="btn btn-primary"
                  onClick={handlePause}
                  style={{
                    minWidth: '150px',
                    backgroundColor: '#f59e0b',
                    padding: '0.875rem 1.5rem',
                    fontSize: '1rem',
                    fontWeight: '600'
                  }}
                >
                  ⏸️ Pausar
                </button>
                <button
                  className="big-toggle btn-stop"
                  onClick={handleStop}
                  style={{ minWidth: '150px' }}
                >
                  ⏹️ Detener
                </button>
              </>
            )}

            {recordingState === "paused" && (
              <>
                <button
                  className="btn btn-primary"
                  onClick={handleResume}
                  style={{
                    minWidth: '150px',
                    backgroundColor: 'var(--success-color)',
                    padding: '0.875rem 1.5rem',
                    fontSize: '1rem',
                    fontWeight: '600'
                  }}
                >
                  ▶️ Reanudar
                </button>
                <button
                  className="big-toggle btn-stop"
                  onClick={handleStop}
                  style={{ minWidth: '150px' }}
                >
                  ⏹️ Detener
                </button>
              </>
            )}
          </div>

          {/* Session Info */}
          {sesionInfo && (
            <div className="session-info" style={{ marginTop: '2rem' }}>
              <p><strong>ID Sesión:</strong> {sesionInfo.id}</p>
              <p><strong>Estado:</strong> {sesionInfo.estado}</p>
              {recordingState !== "stopped" && (
                <p><strong>Tiempo transcurrido:</strong> {formatTime(timer)}</p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
