import os
import subprocess
import time
import logging
from pathlib import Path
from datetime import datetime, timezone

from dotenv import load_dotenv
from redis import Redis
from rq import Queue

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

load_dotenv()

# LOGGING

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("enhance_worker")


# ENV / SETTINGS

FFMPEG = os.getenv("FFMPEG_BIN", "ffmpeg")


DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("database_url") or ""
if not DATABASE_URL:
    raise RuntimeError("Falta DATABASE_URL en .env")

DATABASE_URL_SYNC = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)

REDIS_URL = os.getenv("REDIS_URL") or os.getenv("redis_url") or "redis://localhost:6379/0"

STORAGE_ROOT = Path(os.getenv("STORAGE_ROOT", "storage")).resolve()
INCOMING_DIR = STORAGE_ROOT / "incoming"
ENHANCED_DIR = STORAGE_ROOT / "enhanced"

# Parámetros de enhance (configurables por .env)
TARGET_I = float(os.getenv("ENH_TARGET_I", "-20"))
TARGET_TP = float(os.getenv("ENH_TARGET_TP", "-2.0"))
TARGET_LRA = float(os.getenv("ENH_TARGET_LRA", "7"))
AFFTDN_NR = int(os.getenv("ENH_AFFTDN_NR", "12"))
AFFTDN_NF = int(os.getenv("ENH_AFFTDN_NF", "-38"))
HIGHPASS_HZ = int(os.getenv("ENH_HIGHPASS_HZ", "90"))
LOWPASS_HZ = int(os.getenv("ENH_LOWPASS_HZ", "7600"))
# Boost de presencia en 2600Hz muy suave para mantener la naturalidad de la voz
PRESENCE_BOOST_HZ = int(os.getenv("ENH_PRESENCE_HZ", "2600"))
PRESENCE_BOOST_DB = float(os.getenv("ENH_PRESENCE_DB", "1.0"))


# DB (SYNC)

engine = create_engine(
    DATABASE_URL_SYNC,
    pool_pre_ping=True,
    pool_recycle=1800,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def _db_set_estado(grabacion_id: str, estado: str) -> None:
    db = SessionLocal()
    try:
        db.execute(
            text("UPDATE public.grabaciones SET estado_proceso=:st WHERE id=:id"),
            {"st": estado, "id": grabacion_id},
        )
        db.commit()
    finally:
        db.close()

def _db_set_failed(grabacion_id: str, motivo: str) -> None:
    log.error("FAILED grabacion_id=%s — %s", grabacion_id, motivo)
    _db_set_estado(grabacion_id, "FAILED")


# AUDIO: UNA SOLA PASADA Y MÉTRICAS

def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def get_audio_duration(file_path: str) -> float:
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file_path
    ]
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return float(p.stdout.strip())
    except Exception:
        return 0.0


def compute_audio_metrics(wav_path: str) -> dict:
    import numpy as np
    import scipy.io.wavfile as wavfile
    
    try:
        sr, data = wavfile.read(wav_path)
        
        # Convertir a float32 en rango [-1.0, 1.0]
        if data.dtype == np.int16:
            data_float = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32:
            data_float = data.astype(np.float32) / 2147483648.0
        elif data.dtype == np.uint8:
            data_float = (data.astype(np.float32) - 128.0) / 128.0
        else:
            data_float = data.astype(np.float32)
            
        num_samples = len(data_float)
        if num_samples == 0:
            return {}
            
        # Pico máximo (dBFS)
        peak = np.max(np.abs(data_float))
        peak_db = 20 * np.log10(peak) if peak > 1e-6 else -99.0
        
        # RMS (dBFS)
        rms = np.sqrt(np.mean(data_float**2))
        rms_db = 20 * np.log10(rms) if rms > 1e-6 else -99.0
        
        # Clipping percentage (muestras saturadas, e.g. >= 0.999)
        clipping_samples = np.sum(np.abs(data_float) >= 0.999)
        clipping_pct = (clipping_samples / num_samples) * 100.0
        
        # Floor noise level & SNR estimation using windowed RMS
        # Ventanas de 100ms (1600 samples a 16kHz)
        win_size = int(0.1 * sr)
        num_windows = num_samples // win_size
        win_rms = []
        for i in range(num_windows):
            win = data_float[i*win_size:(i+1)*win_size]
            w_rms = np.sqrt(np.mean(win**2))
            win_rms.append(w_rms)
            
        win_rms = np.array(win_rms)
        win_rms_db = 20 * np.log10(win_rms + 1e-6)
        
        # Piso de ruido: percentil 10
        sorted_rms_db = np.sort(win_rms_db)
        noise_floor_db = float(np.percentile(win_rms_db, 10)) if len(win_rms_db) > 0 else -99.0
        
        # Zonas activas (voz): promedio de las ventanas superiores al percentil 40
        active_rms_db = float(np.mean(sorted_rms_db[int(len(sorted_rms_db) * 0.40):])) if len(sorted_rms_db) > 0 else -99.0
        
        # SNR Estimada: diferencia entre voz activa y piso de ruido
        snr_db = max(0.0, active_rms_db - noise_floor_db)
        
        # Porcentaje de actividad vocal: ventanas por encima del umbral adaptativo (piso + 4.0 dB)
        vocal_threshold = noise_floor_db + 4.0
        vocal_windows = np.sum(win_rms_db > vocal_threshold)
        activity_pct = (vocal_windows / len(win_rms_db)) * 100.0 if len(win_rms_db) > 0 else 0.0
        
        # MÉTDRICAS ESPECTRALES (Densidad de potencia usando welch)
        from scipy import signal
        frequencies, psd = signal.welch(data_float, fs=sr, nperseg=min(len(data_float), 1024))
        total_power = np.sum(psd)
        
        # Banda 0-80 Hz
        idx_0_80 = np.where((frequencies >= 0) & (frequencies < 80))[0]
        pwr_0_80 = np.sum(psd[idx_0_80]) if len(idx_0_80) > 0 else 0.0
        pct_0_80 = (pwr_0_80 / total_power) * 100.0 if total_power > 0 else 0.0
        
        # Banda 80-300 Hz
        idx_80_300 = np.where((frequencies >= 80) & (frequencies < 300))[0]
        pwr_80_300 = np.sum(psd[idx_80_300]) if len(idx_80_300) > 0 else 0.0
        pct_80_300 = (pwr_80_300 / total_power) * 100.0 if total_power > 0 else 0.0
        
        # Banda 300-3400 Hz
        idx_300_3400 = np.where((frequencies >= 300) & (frequencies < 3400))[0]
        pwr_300_3400 = np.sum(psd[idx_300_3400]) if len(idx_300_3400) > 0 else 0.0
        pct_300_3400 = (pwr_300_3400 / total_power) * 100.0 if total_power > 0 else 0.0
        
        # Banda 3400-7800 Hz
        idx_3400_7800 = np.where((frequencies >= 3400) & (frequencies < 7800))[0]
        pwr_3400_7800 = np.sum(psd[idx_3400_7800]) if len(idx_3400_7800) > 0 else 0.0
        pct_3400_7800 = (pwr_3400_7800 / total_power) * 100.0 if total_power > 0 else 0.0
        
        # Centroide espectral
        centroid = float(np.sum(frequencies * psd) / total_power) if total_power > 0 else 0.0
        
        return {
            "rms": round(rms_db, 2),
            "pico_maximo": round(peak_db, 2),
            "clipping_pct": round(clipping_pct, 6),
            "noise_floor": round(noise_floor_db, 2),
            "snr_estimada": round(snr_db, 2),
            "activity_pct": round(activity_pct, 2),
            "energia_0_80_pct": round(pct_0_80, 2),
            "energia_80_300_pct": round(pct_80_300, 2),
            "energia_300_3400_pct": round(pct_300_3400, 2),
            "energia_3400_7800_pct": round(pct_3400_7800, 2),
            "centroide_espectral_hz": round(centroid, 2)
        }
    except Exception as e:
        log.warning(f"Error al calcular métricas acústicas: {e}")
        return {}


def _db_save_enhance_metrics(grabacion_id: str, metrics: dict) -> None:
    db = SessionLocal()
    try:
        # Obtener métricas existentes
        res = db.execute(
            text("SELECT metricas FROM public.grabaciones WHERE id = :id"),
            {"id": grabacion_id}
        )
        row = res.first()
        existing_metrics = {}
        if row and row[0]:
            existing_metrics = row[0]
            if not isinstance(existing_metrics, dict):
                existing_metrics = {}
                
        # Combinar
        existing_metrics.update(metrics)
        
        # Guardar
        import json
        db.execute(
            text("UPDATE public.grabaciones SET metricas = :metrics WHERE id = :id"),
            {"metrics": json.dumps(existing_metrics), "id": grabacion_id}
        )
        db.commit()
    except Exception as e:
        log.warning(f"Error al guardar métricas de enhance en DB: {e}")
    finally:
        db.close()


def diarization_single_pass(input_file: str, out_wav: str) -> float:
    """
    Genera una versión de audio con ecualización mínima para preservar los formantes y
    características del habla original necesarias para Pyannote Diarization.
    """
    t0 = time.perf_counter()
    # Solo paso alto para eliminar frecuencias subgraves y loudnorm suave
    filter_list = [
        "highpass=f=90",
        "loudnorm=I=-22:LRA=10:TP=-2"
    ]
    af = ",".join(filter_list)
    cmd = [
        FFMPEG, "-y",
        "-i", input_file,
        "-af", af,
        "-ac", "1", "-ar", "16000",
        "-sample_fmt", "s16",
        out_wav
    ]
    p = _run(cmd)
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg diarization pass falló:\n{p.stderr}")
    return time.perf_counter() - t0


def enhance_single_pass(input_file: str, out_wav: str) -> float:
    """
    Convierte y mejora el audio usando filtros avanzados de FFmpeg en una sola pasada.
    Elimina silenceremove para mantener consistencia de timestamps de cara a WhisperX/Pyannote.
    """
    t0 = time.perf_counter()

    # 1. Filtros de entrada paso alto/bajo
    filter_list = [
        f"highpass=f={HIGHPASS_HZ}",
        f"lowpass=f={LOWPASS_HZ}",
    ]
    
    # 2. Denoise inteligente (no acumular RNNoise + afftdn automáticamente)
    denoise_mode = os.getenv("ENH_DENOISE_MODE", "afftdn").lower()
    rnnoise_path = Path("/app/models/rnnoise") / os.getenv("ENH_RNNOISE_MODEL", "bd.rnnn")
    
    if denoise_mode == "rnnoise" and rnnoise_path.exists():
        filter_list.append(f"arnndn=m={rnnoise_path.as_posix()}")
    elif denoise_mode == "afftdn" or denoise_mode != "none":
        filter_list.append(f"afftdn=nr={AFFTDN_NR}:nf={AFFTDN_NF}")
        
    # 3. Filtros acústicos de ecualización, compresión y normalización recomendados
    filter_list.extend([
        "equalizer=f=160:t=q:w=0.9:g=-4",  # Atenúa subgraves
        "equalizer=f=280:t=q:w=1.0:g=-2",  # Atenúa graves resonantes
        f"equalizer=f={PRESENCE_BOOST_HZ}:t=q:w=1:g={PRESENCE_BOOST_DB}",  # Presencia vocal (2600Hz)
        "acompressor=threshold=-22dB:ratio=1.7:attack=15:release=220:makeup=1",  # Compresión suave
        f"loudnorm=I={TARGET_I}:LRA={TARGET_LRA}:TP={TARGET_TP}",  # Normalización inteligente (-20 LUFS)
    ])
    
    af = ",".join(filter_list)

    cmd_enh = [
        FFMPEG, "-y",
        "-i", input_file,
        "-af", af,
        "-ac", "1", "-ar", "16000",
        "-sample_fmt", "s16",
        out_wav
    ]
    
    p_enh = _run(cmd_enh)
    if p_enh.returncode != 0:
        raise RuntimeError(f"ffmpeg filtrado falló:\n{p_enh.stderr}")

    elapsed = time.perf_counter() - t0
    return elapsed



# RQ JOB

def enhance_job(grabacion_id: str, incoming_path: str, yyyymmdd: str):
    """
    Etapa B (Enhance):
    - Marca ENHANCING
    - Convierte + mejora para ASR (ENH) y genera copia para diarización (DIAR)
    - Guarda en storage/enhanced/<yyyymmdd>/
    - Marca ENHANCED
    - Encola WhisperX
    """
    t_total = time.perf_counter()
    log.info("=== INICIO enhance_job | grabacion_id=%s ===", grabacion_id)

    try:
        _db_set_estado(grabacion_id, "ENHANCING")

        in_path = Path(incoming_path)
        if not in_path.exists():
            _db_set_failed(grabacion_id, f"No existe incoming: {incoming_path}")
            raise FileNotFoundError(f"No existe incoming: {incoming_path}")

        # Salidas
        enhanced_dir = ENHANCED_DIR / yyyymmdd
        enhanced_dir.mkdir(parents=True, exist_ok=True)

        out_path = enhanced_dir / f"{grabacion_id}_ENH.wav"
        diar_path = enhanced_dir / f"{grabacion_id}_DIAR.wav"

        # ASR Enhance Pass
        t_enh = enhance_single_pass(str(in_path), str(out_path))
        log.info("Enhance ASR completado en %.2f s | %s", t_enh, out_path.name)

        # Diarization Pass (light filtering)
        t_diar = diarization_single_pass(str(in_path), str(diar_path))
        log.info("Diarization audio completado en %.2f s | %s", t_diar, diar_path.name)

        # Calcular y guardar métricas de audio
        try:
            metrics = compute_audio_metrics(str(out_path))
            metrics["duracion_original"] = round(get_audio_duration(str(in_path)), 2)
            metrics["duracion_procesada"] = round(get_audio_duration(str(out_path)), 2)
            metrics["processing_time_enhance"] = round(t_enh, 2)
            metrics["perfil_enhance"] = "moderado" if os.getenv("ENH_DENOISE_MODE", "afftdn").lower() == "afftdn" else "agresivo"
            metrics["denoise_mode"] = os.getenv("ENH_DENOISE_MODE", "afftdn").lower()
            metrics["highpass_hz"] = HIGHPASS_HZ
            metrics["afftdn_nr"] = AFFTDN_NR
            metrics["afftdn_nf"] = AFFTDN_NF
            
            _db_save_enhance_metrics(grabacion_id, metrics)
            log.info("Métricas de enhance guardadas en base de datos para grabacion_id=%s", grabacion_id)
        except Exception as em:
            log.warning("No se pudieron guardar las métricas de enhance: %s", em)

        _db_set_estado(grabacion_id, "ENHANCED")

        # Encolar WhisperX
        redis_conn = Redis.from_url(REDIS_URL)
        q_whisperx = Queue("whisperx", connection=redis_conn)

        #  job_id sin ":" (RQ lo prohíbe)
        q_whisperx.enqueue(
            "whisperx_worker.whisperx_worker.transcribe_job",
            grabacion_id,
            yyyymmdd,
            job_id=f"whisperx_{grabacion_id}",
            result_ttl=3600,
            ttl=3600,
            failure_ttl=86400,
            job_timeout=1800,
        )

        _db_set_estado(grabacion_id, "WHISPERX_QUEUED")

        t_total_elapsed = round(time.perf_counter() - t_total, 2)
        log.info("=== FIN enhance_job | total=%.2f s | grabacion_id=%s ===",
                 t_total_elapsed, grabacion_id)

        return {
            "grabacion_id": grabacion_id,
            "enhanced_path": str(out_path),
            "estado": "WHISPERX_QUEUED",
            "t_enhance_sec": t_total_elapsed,
        }

    except Exception as e:
        # Marca FAILED si algo falla
        try:
            _db_set_failed(grabacion_id, f"{type(e).__name__}: {e}")
        except Exception:
            pass
        raise
