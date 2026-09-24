# whisperx_worker/whisperx_worker.py
# ============================================================
# Worker WhisperX — Transcripción + Diarización OPTIMIZADA
# Modelo: large-v3-turbo | RTX 3060 12 GB
# ASR: beam_size=5, suppress_numerals, anti-hallucination
# Diarización: pyannote/speaker-diarization-3.1 (estable)
# ============================================================
import gc
import logging
import os
import time
import uuid
from pathlib import Path
from datetime import datetime, timezone

import certifi
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=ROOT / ".env", override=True)

# ===== SSL patch Windows =====
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ.pop("REQUESTS_CA_BUNDLE", None)
os.environ.pop("CURL_CA_BUNDLE", None)

# =========================
# LOGGING
# =========================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("whisperx_worker")

# =========================
# CONFIG .env
# =========================
HF_TOKEN       = os.getenv("HF_TOKEN", "").strip()
DB_URL         = os.getenv("DATABASE_URL_SYNC", "").strip()
STORAGE_ROOT   = Path(os.getenv("STORAGE_ROOT", "storage")).resolve()

MODEL_SIZE     = os.getenv("WHISPERX_MODEL_SIZE", "large-v3-turbo").strip()
LANG           = os.getenv("WHISPERX_LANG", "es").strip()
DEVICE_PREF    = os.getenv("WHISPERX_DEVICE", "cuda").strip().lower()
BATCH_SIZE     = int(os.getenv("WHISPERX_BATCH_SIZE", "16"))
MIN_SPEAKERS   = int(os.getenv("WHISPERX_MIN_SPEAKERS", "2"))
MAX_SPEAKERS   = int(os.getenv("WHISPERX_MAX_SPEAKERS", "2"))

# ASR Options — máxima precisión para call center español (objetivo ≥ 95%)
# beam_size=10: exploración más amplia → menor WER (-5 a -10% vs beam=5)
# beam_size=5: menor tasa de alucinaciones
BEAM_SIZE      = int(os.getenv("WHISPERX_BEAM_SIZE", "5"))
CONDITION_PREV = os.getenv("WHISPERX_CONDITION_PREV", "false").strip().lower() == "true"
SUPPRESS_NUM   = os.getenv("WHISPERX_SUPPRESS_NUMERALS", "false").strip().lower() == "true"

# initial_prompt: proporciona contexto de dominio al modelo SIN forzar texto
INITIAL_PROMPT = os.getenv(
    "WHISPERX_INITIAL_PROMPT",
    "Conversación en una caja entre cajero y cliente. Se mencionan productos, precios, pagos, efectivo, tarjeta, factura y cambio."
).strip()

# El motor de beam search favorece estas palabras durante la decodificación
# -> Soluciona OOV (Out-Of-Vocabulary): nombres propios, siglas, marcas
# Formato CSV en .env: WHISPERX_HOTWORDS=cajero,cliente,factura
_hotwords_raw = os.getenv(
    "WHISPERX_HOTWORDS",
    "cajero,cliente,factura,pago,tarjeta,efectivo,servicio,gracias"
).strip()
HOTWORDS: list[str] = [w.strip() for w in _hotwords_raw.split(",") if w.strip()] if _hotwords_raw else []

# Diarización -> modelo configurable (pyannote 3.1 estable por defecto)
DIAR_MODEL     = os.getenv(
    "WHISPERX_DIAR_MODEL",
    "pyannote/speaker-diarization-3.1"
).strip()

# VAD Options - Configuraciones de Whisper y VAD
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "large-v3")
# Bajamos los umbrales de VAD casi al mínimo para que no elimine voces reales que suenan bajo o lejos
VAD_ONSET = float(os.getenv("WHISPERX_VAD_ONSET", "0.050"))
VAD_OFFSET = float(os.getenv("WHISPERX_VAD_OFFSET", "0.020"))
INITIAL_PROMPT = os.getenv("WHISPERX_INITIAL_PROMPT", "Bienvenidos a la ferretería. Tenemos tubos de PVC, clavos, tornillos, pintura, cemento, alambre, pulgadas, pernos, lijas, brochas. ¿Desea factura con datos o consumidor final? Son cinco dólares. Muchas gracias, vuelva pronto.")

# ---- LÍMITES DE RECURSOS (objetivo: máximo 70% de cada recurso) ----
VRAM_FRACTION  = float(os.getenv("WHISPERX_VRAM_FRACTION", "0.70"))
CPU_THREADS    = int(os.getenv("WHISPERX_CPU_THREADS", "0"))  # 0 = auto (PyTorch decide)

if not DB_URL:
    raise RuntimeError("Falta DATABASE_URL_SYNC en .env")
if not HF_TOKEN or not HF_TOKEN.startswith("hf_"):
    raise RuntimeError("HF_TOKEN inválido o no configurado en .env")

# Paths
ENHANCED_DIR = STORAGE_ROOT / "enhanced"

# =========================
# IMPORTS PESADOS
# =========================
import torch
import whisperx
import whisperx.diarize
from redis import Redis
from rq import Queue

try:
    import psutil
    _HAS_PSUTIL = True
except ImportError:
    _HAS_PSUTIL = False
    log.warning("psutil no disponible — monitoreo de CPU/RAM deshabilitado")


# =========================
# CACHE DE MODELOS (una sola carga por proceso RQ — ahorra 15-30s por job)
# =========================
_DEVICE: str | None          = None
_COMPUTE_TYPE: str | None    = None
_ASR_MODEL                   = None   # whisperx ASR
_ALIGN_MODEL                 = None   # alignment model
_ALIGN_META                  = None   # alignment metadata
_DIAR_PIPELINE               = None   # pyannote diarization pipeline


def _resolve_device() -> tuple[str, str]:
    """Devuelve (device, compute_type) según hardware disponible."""
    device = "cuda" if (DEVICE_PREF == "cuda" and torch.cuda.is_available()) else "cpu"
    compute_type = "float16" if device == "cuda" else "float32"
    return device, compute_type


def _log_vram(label: str):
    """Log de uso de VRAM de GPU (solo CUDA)."""
    if torch.cuda.is_available():
        alloc = torch.cuda.memory_allocated() / (1024 ** 3)
        reserved = torch.cuda.memory_reserved() / (1024 ** 3)
        total = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        pct = (alloc / total) * 100 if total > 0 else 0
        log.info("VRAM [%s]: allocated=%.2f GB | reserved=%.2f GB | total=%.1f GB | uso=%.0f%%",
                 label, alloc, reserved, total, pct)


def _log_system_resources(label: str):
    """Log completo de CPU, RAM y VRAM."""
    if _HAS_PSUTIL:
        cpu_pct = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        log.info("RECURSOS [%s]: CPU=%.1f%% | RAM=%.1f/%.1f GB (%.0f%%) | Disponible=%.1f GB",
                 label, cpu_pct,
                 mem.used / (1024**3), mem.total / (1024**3), mem.percent,
                 mem.available / (1024**3))
    _log_vram(label)


def _get_models():
    """
    Carga los modelos una sola vez por proceso worker.
    En llamadas siguientes devuelve los objetos ya en memoria.

    ASR se carga con asr_options optimizados para call center:
    - beam_size=5: balance calidad/velocidad
    - condition_on_previous_text=False: anti-hallucination
    - suppress_numerals=True: mejor timestamp para números
    - initial_prompt: contexto de call center en español
    """
    global _DEVICE, _COMPUTE_TYPE, _ASR_MODEL, _ALIGN_MODEL, _ALIGN_META, _DIAR_PIPELINE

    # Solo retornamos la caché si TODOS los modelos principales están cargados.
    # Así evitamos devolver un `None` si un job anterior falló a la mitad de la carga (WindowsWorker no hace fork).
    if _ASR_MODEL is not None and _ALIGN_MODEL is not None and _DIAR_PIPELINE is not None:
        return _DEVICE, _COMPUTE_TYPE, _ASR_MODEL, _ALIGN_MODEL, _ALIGN_META, _DIAR_PIPELINE

    device, compute_type = _resolve_device()
    _DEVICE       = device
    _COMPUTE_TYPE = compute_type

    # ---- APLICAR LÍMITES DE RECURSOS ----
    if device == "cuda":
        torch.cuda.set_per_process_memory_fraction(VRAM_FRACTION, device=0)
        total_vram = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        log.info("🔒 VRAM LIMITADA a %.0f%% — máximo %.1f GB de %.1f GB totales",
                 VRAM_FRACTION * 100, total_vram * VRAM_FRACTION, total_vram)

    if CPU_THREADS > 0:
        torch.set_num_threads(CPU_THREADS)
        log.info("🔒 CPU THREADS limitado a %d hilos (PyTorch)", CPU_THREADS)
    else:
        log.info("CPU THREADS: auto (%d hilos detectados por PyTorch)", torch.get_num_threads())

    # ----- ASR OPTIONS - Estándar 100% Nativo (sin filtros agresivos) -----
    asr_options = {
        "beam_size": BEAM_SIZE,
        "condition_on_previous_text": False,  # FORZADO A FALSE: Evita repeticiones en silencios
        "suppress_numerals": SUPPRESS_NUM,
        "initial_prompt": None, # DESACTIVADO TOTALMENTE para evitar que se invente estas palabras
        "hotwords": ",".join(HOTWORDS) if HOTWORDS else None,
        "no_speech_threshold": 0.85, # Aumentado para rechazar ruido de fondo (def: 0.6)
        "logprob_threshold": -1.0,
        "temperature": 0.0 # OBLIGAR a no usar fallback. El fallback con temperatura alta inventa barbaridades
    }

    # ----- VAD OPTIONS -----
    # Elevamos ligeramente el VAD_ONSET para no transcribir puro ruido
    vad_options = {
        "vad_onset": 0.400, # Subimos el umbral drásticamente para filtrar ruido de la ferretería
        "vad_offset": 0.200,
    }

    log.info("=" * 60)
    log.info("Cargando modelos WhisperX - Configuración Estándar de Producción:")
    log.info("  ASR model:     %s", MODEL_SIZE)
    log.info("  Device:        %s | compute_type=%s", device, compute_type)
    log.info("  Batch size:    %d", BATCH_SIZE)
    log.info("  VAD onset:     %.3f | offset: %.3f", VAD_ONSET, VAD_OFFSET)
    log.info("  Diarización:   %s", DIAR_MODEL)
    log.info("  Speakers:      min=%d max=%d", MIN_SPEAKERS, MAX_SPEAKERS)
    log.info("=" * 60)

    t0 = time.perf_counter()

    # 1) ASR model (faster-whisper backend vía whisperx)
    log.info("[1/3] Cargando ASR model (estándar)...")
    _ASR_MODEL = whisperx.load_model(
        MODEL_SIZE,
        device,
        compute_type=compute_type,
        language=LANG or None,
        asr_options=asr_options,
        vad_options=vad_options,
    )
    log.info("[1/3] ASR model cargado en %.1f s", time.perf_counter() - t0)
    _log_vram("post-ASR")

    # 2) Alignment model
    t1 = time.perf_counter()
    log.info("[2/3] Cargando Align model...")
    language_code = LANG or "es"
    _ALIGN_MODEL, _ALIGN_META = whisperx.load_align_model(
        language_code=language_code,
        device=device,
    )
    log.info("[2/3] Align model cargado en %.1f s", time.perf_counter() - t1)
    _log_vram("post-Align")

    # 3) Pyannote diarization pipeline
    t2 = time.perf_counter()
    log.info("[3/3] Cargando Diarization Pipeline (%s)...", DIAR_MODEL)
    try:
        _DIAR_PIPELINE = whisperx.diarize.DiarizationPipeline(
            model_name=DIAR_MODEL,
            use_auth_token=HF_TOKEN,
            device=device,
        )
    except TypeError:
        # Fallback: versiones antiguas de whisperx no aceptan model_name
        log.warning("model_name no soportado, cargando diarización por defecto (3.1)")
        _DIAR_PIPELINE = whisperx.diarize.DiarizationPipeline(
            use_auth_token=HF_TOKEN,
            device=device,
        )
    log.info("[3/3] Diarization Pipeline cargado en %.1f s", time.perf_counter() - t2)
    _log_vram("post-Diarization")

    log.info("Todos los modelos listos. Tiempo total carga: %.1f s", time.perf_counter() - t0)
    return _DEVICE, _COMPUTE_TYPE, _ASR_MODEL, _ALIGN_MODEL, _ALIGN_META, _DIAR_PIPELINE


# =========================
# HELPERS
# =========================
def clean_transcription_segments(segments: list) -> list:
    """
    Estándar 100% nativo: Retorna los segmentos intactos para no perder NADA 
    del texto original devuelto por el modelo WhisperX.
    """
    return segments


def _utcnow():
    return datetime.now(timezone.utc)


def _enhanced_path(grabacion_id: str, yyyymmdd: str) -> Path:
    return ENHANCED_DIR / yyyymmdd / f"{grabacion_id}_ENH.wav"


def _db_connect():
    import psycopg2
    dsn = (DB_URL or "").strip()
    if dsn.startswith("postgresql+psycopg2://"):
        dsn = dsn.replace("postgresql+psycopg2://", "postgresql://", 1)
    return psycopg2.connect(dsn)


def _set_estado(conn, grabacion_id: str, estado: str):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE public.grabaciones SET estado_proceso=%s WHERE id=%s",
            (estado, grabacion_id),
        )


def _insert_transcripcion(conn, grabacion_id: str, texto_completo: str) -> str:
    trans_id = str(uuid.uuid4())
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.transcripciones (id, grabacion_id, texto_completo, created_at)
            VALUES (%s, %s, %s, now())
            """,
            (trans_id, grabacion_id, texto_completo),
        )
    return trans_id


def _insert_segmentos(conn, transcripcion_id: str, segments: list):
    """
    Inserta segmentos con speaker asignado por whisperx.assign_word_speakers().
    """
    with conn.cursor() as cur:
        for orden, seg in enumerate(segments, start=1):
            seg_id  = str(uuid.uuid4())
            start   = float(seg.get("start", 0.0))
            end     = float(seg.get("end", 0.0))
            text    = (seg.get("text") or "").strip()
            speaker = seg.get("speaker")
            rol     = seg.get("rol_inferido")

            cur.execute(
                """
                INSERT INTO public.segmentos_transcripcion
                (id, transcripcion_id, inicio_segundo, fin_segundo, hablante, rol_inferido, texto, orden)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (seg_id, transcripcion_id, start, end, speaker, rol, text, orden),
            )


def _db_save_whisper_metrics(conn, grabacion_id: str, metrics: dict) -> None:
    import json
    try:
        with conn.cursor() as cur:
            # Obtener métricas existentes
            cur.execute("SELECT metricas FROM public.grabaciones WHERE id = %s", (grabacion_id,))
            row = cur.fetchone()
            existing_metrics = {}
            if row and row[0]:
                if isinstance(row[0], dict):
                    existing_metrics = row[0]
                elif isinstance(row[0], str):
                    try:
                        existing_metrics = json.loads(row[0])
                    except Exception:
                        existing_metrics = {}
            
            # Combinar
            existing_metrics.update(metrics)
            
            # Guardar
            cur.execute(
                "UPDATE public.grabaciones SET metricas = %s WHERE id = %s",
                (json.dumps(existing_metrics), grabacion_id)
            )
    except Exception as e:
        log.warning(f"Error al guardar métricas de Whisper en DB: {e}")


def _vram_free():
    """Libera caché de CUDA sin eliminar los modelos de memoria."""
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        gc.collect()


# =========================
# JOB PRINCIPAL
# =========================
def transcribe_job(grabacion_id: str, yyyymmdd: str):
    """
    Job RQ (cola whisperx):
      1. Carga modelos (desde caché si ya están en memoria)
      2. Transcribe con WhisperX large-v3-turbo (batch_size=16, beam=10, hotwords)
      3. Alínea a nivel de palabra
      4. Diariza con pyannote/speaker-diarization-3.1
      5. Asigna speaker a cada segmento (whisperx.assign_word_speakers nativo)
      6. Guarda transcripción + segmentos en BD
      7. Encola job de análisis LLM
    """
    t_total = time.perf_counter()
    log.info("=" * 60)
    log.info("INICIO transcribe_job | grabacion_id=%s | yyyymmdd=%s",
             grabacion_id, yyyymmdd)

    # Monitoreo de recursos al inicio del job
    _log_system_resources("INICIO-JOB")

    # Priorizar el audio MEJORADO (enhanced) para transcribir y diarizar
    # ya que contiene reducción de ruido avanzada y volumen de voz normalizado,
    # cayendo al audio original (incoming) si no está disponible.
    audio_path = _enhanced_path(grabacion_id, yyyymmdd)
    if audio_path and audio_path.exists():
        log.info("Cargando audio MEJORADO (Enhanced) para transcripción: %s", audio_path.name)
    else:
        log.warning("Audio MEJORADO no encontrado en '%s'. Aplicando fallback a audio ORIGINAL sin mejorar!", audio_path)
        audio_path = None
        incoming_dir = STORAGE_ROOT / "incoming" / yyyymmdd
        if incoming_dir.exists():
            for p in incoming_dir.iterdir():
                if p.stem == grabacion_id and p.suffix.lower() in [".wav", ".mp3", ".m4a", ".ogg", ".flac"]:
                    audio_path = p
                    break
                    
    if not audio_path or not audio_path.exists():
        raise FileNotFoundError(f"No existe el archivo de audio para procesar (grabacion_id={grabacion_id})")

    log.info("Audio para ASR/Diarización: %s (%.1f MB)", audio_path.name,
             audio_path.stat().st_size / (1024 * 1024))

    # Obtener modelos (cargados 1 sola vez por proceso)
    device, compute_type, asr_model, align_model, align_meta, diar_pipeline = _get_models()

    conn = _db_connect()
    conn.autocommit = False

    try:
        _set_estado(conn, grabacion_id, "TRANSCRIBING")
        conn.commit()

        # ----------------------------------------------------------
        # PASO 1: Transcripción ASR
        # ----------------------------------------------------------
        log.info("[1/4] Transcribiendo con %s (batch=%d, beam=%d, hotwords=%d)...",
                 MODEL_SIZE, BATCH_SIZE, BEAM_SIZE, len(HOTWORDS))
        t1 = time.perf_counter()

        audio = whisperx.load_audio(str(audio_path))
        audio_duration_sec = len(audio) / 16000.0
        log.info("  Audio de ASR (ENH) cargado: %.1f s de duración", audio_duration_sec)

        # Cargar audio de diarización (DIAR) si existe para Pyannote
        diar_audio_path = str(audio_path).replace("_ENH.wav", "_DIAR.wav")
        if os.path.exists(diar_audio_path):
            log.info("  Cargando audio optimizado para diarización desde %s", diar_audio_path)
            diar_audio = whisperx.load_audio(diar_audio_path)
        else:
            log.warning("  No se encontró audio de diarización (%s), usando audio de ASR...", diar_audio_path)
            diar_audio = audio

        transcribe_kwargs = dict(
            batch_size=BATCH_SIZE,
            print_progress=False,
        )
        if LANG:
            transcribe_kwargs["language"] = LANG
            
        # hotwords: en versiones de whisperx puede no estar soportado en transcribe()
        if HOTWORDS:
            transcribe_kwargs["hotwords"] = ",".join(HOTWORDS) if isinstance(HOTWORDS, list) else HOTWORDS

        try:
            base_result = asr_model.transcribe(audio, **transcribe_kwargs)
        except TypeError as e:
            if "hotwords" in str(e):
                log.warning("WhisperX no acepta 'hotwords' en transcribe(), omitiéndolo...")
                transcribe_kwargs.pop("hotwords", None)
                base_result = asr_model.transcribe(audio, **transcribe_kwargs)
            else:
                raise e

        language_code = LANG or base_result.get("language", "es")

        # --- FILTRO ANTIALUCINACIONES ---
        # WhisperX a menudo alucina frases de Youtube o repite el prompt inicial en silencios.
        known_hallucinations = [
            "gracias por ver el video",
            "gracias por ver el vídeo",
            "atención al cliente en caja",
            "atencion al cliente en caja",
            "subtítulos realizados",
            "subtitulos realizados",
            "amara.org",
            "suscríbete",
            "suscribete",
            "gracias por su atención",
            "gracias por su atencion",
            "gracias por su compania",
            "música música",
            "musica musica",
            "ok bien si chao",
            "bien si chao",
            "se mencionan",
            "pulgadas medidas precios",
            "el cajero realiza la venta",
            "conversacion de atencion al cliente",
            "conversación de atención al cliente",
            "subtítulos por la comunidad de amara.org",
            "subtítulos por",
            "suscríbete al canal",
            "www.cdc.gov",
            "cdc.gov",
            "más información"
        ]
        
        if INITIAL_PROMPT:
            # Añadir sub-frases clave del prompt para atrapar alucinaciones variadas
            known_hallucinations.extend([
                "el cajero realiza la venta de",
                "la venta de artículos como",
                "se mencionan pulgadas, medidas",
                "precios y facturas",
                "bienvenidos a la ferreteria",
                "tenemos tubos de pvc",
                "desea factura con datos o consumidor final",
                "muchas gracias vuelva pronto",
                "son cinco dolares"
            ])

        filtered_segments = []
        prev_clean_text = None
        
        for seg in base_result.get("segments", []):
            text_lower = seg["text"].lower().strip()
            text_clean = text_lower.replace(".", "").replace(",", "").replace("!", "").replace("¿", "").replace("?", "").replace("¡", "")
            words = text_clean.split()
            
            is_hallucination = False
            for h in known_hallucinations:
                h_clean = h.lower().replace(".", "").replace(",", "")
                # Solo borramos si el segmento contiene la alucinación, O si el segmento ES casi igual a la alucinación
                # Para evitar borrar palabras sueltas, requerimos que el text_clean sea largo si vamos a usar "text_clean in h_clean"
                if len(h_clean) > 10:
                    if (h_clean in text_clean) or (len(text_clean) > 15 and text_clean in h_clean):
                        is_hallucination = True
                        break
                        
            if is_hallucination:
                log.warning(f"FILTRADO (Alucinacion de Prompt detectada): '{seg['text']}'")
                continue
                
            # Filtro: Repetición intra-segmento (misma palabra muchas veces)
            if len(words) >= 4:
                counts = __import__('collections').Counter(words)
                top_freq = counts.most_common(1)[0][1]
                if top_freq >= 4 and (top_freq / len(words)) >= 0.5:
                    log.warning(f"FILTRADO (Repeticion palabra intra-segmento): '{seg['text']}'")
                    continue
                    
            # Filtro: Repetición de secuencia (Ej: "A B C A B C" o "A B A B A B")
            n = len(words)
            if n >= 4 and n % 2 == 0 and words[:n//2] == words[n//2:]:
                log.warning(f"FILTRADO (Secuencia repetida x2): '{seg['text']}'")
                continue
            if n >= 6 and n % 3 == 0 and words[:n//3] * 3 == words:
                log.warning(f"FILTRADO (Secuencia repetida x3): '{seg['text']}'")
                continue

            # Filtro: Inter-segmento (repite el segmento anterior exacto)
            if prev_clean_text and text_clean == prev_clean_text and len(words) <= 8:
                log.warning(f"FILTRADO (Repeticion inter-segmento exacta): '{seg['text']}'")
                continue
                
            # Filtro: Alucinación por silencio (pocas palabras, mucho tiempo)
            seg_duration = seg.get("end", 0) - seg.get("start", 0)
            if len(words) <= 6 and seg_duration > 6.0:
                log.warning(f"FILTRADO (Muy pocas palabras {len(words)} en mucho tiempo {seg_duration:.1f}s): '{seg['text']}'")
                continue
            
            # Ignorar si es extremadamente corto y solo ruido
            if len(text_clean) < 2:
                continue
                
            prev_clean_text = text_clean
            filtered_segments.append(seg)
            
        base_result["segments"] = filtered_segments
        # --------------------------------

        n_segments_raw = len(base_result.get("segments", []))
        t1_elapsed = time.perf_counter() - t1
        rtf_asr = t1_elapsed / max(audio_duration_sec, 0.1)

        log.info("[1/4] Transcripción OK — %d segmentos | %.1f s | RTF=%.2fx",
                 n_segments_raw, t1_elapsed, rtf_asr)
        _log_vram("post-transcribe")

        # Liberar VRAM antes de alignment
        _vram_free()

        # ----------------------------------------------------------
        # PASO 2: Alineamiento a nivel de palabra
        # ----------------------------------------------------------
        log.info("[2/4] Alineando palabras...")
        t2 = time.perf_counter()

        aligned_result = whisperx.align(
            base_result["segments"],
            align_model,
            align_meta,
            audio,
            device,
            return_char_alignments=False,
        )

        n_words = sum(
            len(s.get("words", [])) for s in aligned_result.get("segments", [])
        )
        t2_elapsed = time.perf_counter() - t2
        log.info("[2/4] Alignment OK — %d palabras alineadas | %.1f s", n_words, t2_elapsed)

        _log_vram("post-align")
        _vram_free()

        # WhisperX DiarizationPipeline expects min_speakers and max_speakers
        diar_kwargs = {
            "min_speakers": MIN_SPEAKERS,
            "max_speakers": MAX_SPEAKERS
        }
        log.info("[3/4] Diarizando (min_speakers=%d, max_speakers=%d)...", MIN_SPEAKERS, MAX_SPEAKERS)

        t3 = time.perf_counter()

        # DiarizationPipeline natively handles the raw whisperx audio array (using the dedicated diarization copy)
        diarization = diar_pipeline(
            diar_audio,
            **diar_kwargs
        )

        t3_elapsed = time.perf_counter() - t3
        log.info("[3/4] Diarización OK | %.1f s", t3_elapsed)

        _log_vram("post-diarize")
        _vram_free()

        # ----------------------------------------------------------
        # PASO 4: Asignación de speakers (nativo WhisperX + Diarization Fallback)
        # ----------------------------------------------------------
        log.info("[4/4] Asignando speakers a segmentos...")
        t4 = time.perf_counter()

        result_with_speakers = whisperx.assign_word_speakers(diarization, aligned_result)
        segments = result_with_speakers.get("segments", [])

        # Algoritmo de interpolación y solapamiento temporal de Pyannote:
        # Asegura que el 100% de los segmentos tengan speaker asignado (incluso con habla rápida)
        last_speaker = None
        last_segment_end = 0.0
        for seg in segments:
            start = float(seg.get("start", 0.0))
            end = float(seg.get("end", 0.0))
            if not seg.get("speaker"):
                speaker_overlaps = {}
                try:
                    if hasattr(diarization, "itertracks"):
                        for turn, _, speaker in diarization.itertracks(yield_label=True):
                            overlap_start = max(start, turn.start)
                            overlap_end = min(end, turn.end)
                            overlap = overlap_end - overlap_start
                            if overlap > 0:
                                speaker_overlaps[speaker] = speaker_overlaps.get(speaker, 0.0) + overlap
                    elif hasattr(diarization, "iterrows"):
                        for _, row in diarization.iterrows():
                            t_start = float(row.get("start", 0.0))
                            t_end = float(row.get("end", 0.0))
                            speaker = row.get("speaker")
                            if speaker:
                                overlap_start = max(start, t_start)
                                overlap_end = min(end, t_end)
                                overlap = overlap_end - overlap_start
                                if overlap > 0:
                                    speaker_overlaps[speaker] = speaker_overlaps.get(speaker, 0.0) + overlap
                except Exception as e:
                    log.warning(f"Error al calcular solapamiento de speaker: {e}")
                
                if speaker_overlaps:
                    seg["speaker"] = max(speaker_overlaps, key=speaker_overlaps.get)
                elif last_speaker:
                    seg["speaker"] = last_speaker
                else:
                    seg["speaker"] = "SPEAKER_00"
            
            last_speaker = seg.get("speaker")
            last_segment_end = end

        segments = clean_transcription_segments(segments)

        # Contar speakers detectados
        speakers_detectados = {s.get("speaker") for s in segments if s.get("speaker")}

        # Contar distribución por speaker y número de turnos
        speaker_stats = {}
        turn_counts = {}
        for s in segments:
            spk = s.get("speaker", "UNKNOWN")
            dur = float(s.get("end", 0.0)) - float(s.get("start", 0.0))
            speaker_stats[spk] = speaker_stats.get(spk, 0.0) + dur
            turn_counts[spk] = turn_counts.get(spk, 0) + 1

        # Algoritmo Acústico de Identificación del Cajero por Volumen Físico (RMS) y Actividad
        import numpy as np
        speaker_rms = {}
        speaker_samples = {}
        for spk in speakers_detectados:
            if spk and spk != "UNKNOWN":
                speaker_samples[spk] = []

        # Recolectamos las muestras del audio de diarización correspondientes a cada hablante
        for s in segments:
            spk = s.get("speaker")
            if spk and spk in speaker_samples:
                start_sample = int(float(s.get("start", 0.0)) * 16000)
                end_sample = int(float(s.get("end", 0.0)) * 16000)
                start_sample = max(0, min(start_sample, len(diar_audio)))
                end_sample = max(0, min(end_sample, len(diar_audio)))
                if end_sample > start_sample:
                    speaker_samples[spk].append(diar_audio[start_sample:end_sample])

        # Calculamos el promedio de amplitud RMS para cada hablante
        for spk, list_of_arrays in speaker_samples.items():
            if list_of_arrays:
                concatenated = np.concatenate(list_of_arrays)
                rms = float(np.sqrt(np.mean(concatenated**2)))
                speaker_rms[spk] = rms
            else:
                speaker_rms[spk] = 0.0

        # Calificación combinada del Cajero (Loudness 85%, Duración 10%, Turnos 5%)
        max_rms = max(speaker_rms.values()) if speaker_rms else 1.0
        max_dur = max(speaker_stats.values()) if speaker_stats else 1.0
        max_turns = max(turn_counts.values()) if turn_counts else 1.0

        speaker_scores = {}
        cajero_spk = "SPEAKER_00"  # default fallback
        
        valid_speakers = [s for s in speakers_detectados if s and s != "UNKNOWN"]
        for spk in valid_speakers:
            norm_rms = speaker_rms.get(spk, 0.0) / (max_rms if max_rms > 0 else 1.0)
            norm_dur = speaker_stats.get(spk, 0.0) / (max_dur if max_dur > 0 else 1.0)
            norm_turns = turn_counts.get(spk, 0) / (max_turns if max_turns > 0 else 1.0)
            
            score = 0.85 * norm_rms + 0.10 * norm_dur + 0.05 * norm_turns
            speaker_scores[spk] = score
            log.info("Speaker %s puntuación acústica: RMS=%.6f (norm=%.2f), Dur=%.1fs (norm=%.2f), Turnos=%d (norm=%.2f) -> Score=%.3f",
                     spk, speaker_rms.get(spk, 0.0), norm_rms, speaker_stats.get(spk, 0.0), norm_dur, turn_counts.get(spk, 0), norm_turns, score)

        if speaker_scores:
            cajero_spk = max(speaker_scores, key=speaker_scores.get)
        log.info(">>> Hablante acústicamente identificado como CAJERO: %s (Score: %.3f)", cajero_spk, speaker_scores.get(cajero_spk, 0.0))

        t4_elapsed = time.perf_counter() - t4
        log.info("[4/4] Speakers detectados: %s | %.1f s",
                 sorted(speakers_detectados), t4_elapsed)

        for spk, dur in sorted(speaker_stats.items()):
            pct = (dur / max(audio_duration_sec, 0.1)) * 100
            log.info("  → %s: %.1f s (%.0f%%) | turnos: %d", spk, dur, pct, turn_counts.get(spk, 0))

        # ----------------------------------------------------------
        # Guardar en BD
        # ----------------------------------------------------------
        texto_completo = " ".join(
            (s.get("text") or "").strip() for s in segments
        ).strip()

        trans_id = _insert_transcripcion(conn, grabacion_id, texto_completo)
        _insert_segmentos(conn, trans_id, segments)
        
        # Calcular y guardar métricas de WhisperX y Diarización
        try:
            conf_scores = [w.get("score") for s in segments for w in s.get("words", []) if w.get("score") is not None]
            avg_confidence = sum(conf_scores) / len(conf_scores) if conf_scores else 0.0
            
            words_no_timestamp = sum(1 for s in segments for w in s.get("words", []) if w.get("start") is None)
            
            all_words_list = [w.get("word", "").lower().strip() for s in segments for w in s.get("words", []) if w.get("word")]
            repeats = 0
            for i in range(1, len(all_words_list)):
                if all_words_list[i] == all_words_list[i-1]:
                    repeats += 1
                    
            segments_no_speaker = sum(1 for s in segments if not s.get("speaker") or s.get("speaker") == "UNKNOWN")
            
            t_total_elapsed = round(time.perf_counter() - t_total, 2)
            
            # Estadísticas por speaker
            speaker_pcts = {}
            duracion_media_turno = {}
            for spk, dur in speaker_stats.items():
                speaker_pcts[spk] = round((dur / max(audio_duration_sec, 0.1)) * 100, 2)
                count = turn_counts.get(spk, 0)
                duracion_media_turno[spk] = round(dur / count, 2) if count > 0 else 0.0

            whisper_metrics = {
                "speakers_detected": len(speakers_detectados),
                "processing_time_whisper": t_total_elapsed,
                "cajero_speaker": cajero_spk,
                "segments_count": len(segments),
                "words_count": n_words,
                "segments_no_speaker": segments_no_speaker,
                "words_no_timestamp": words_no_timestamp,
                "avg_confidence": round(avg_confidence, 4),
                "repeats_detected": repeats,
                "modelo_whisper": MODEL_SIZE,
                "modelo_diarizacion": DIAR_MODEL,
                "min_speakers": MIN_SPEAKERS,
                "max_speakers": MAX_SPEAKERS,
                "speaker_stats_duration": {k: round(v, 2) for k, v in speaker_stats.items()},
                "speaker_stats_percent": speaker_pcts,
                "speaker_stats_turns": turn_counts,
                "speaker_stats_mean_turn": duracion_media_turno
            }
            _db_save_whisper_metrics(conn, grabacion_id, whisper_metrics)
            log.info("Métricas de WhisperX guardadas en base de datos para grabacion_id=%s", grabacion_id)
        except Exception as e_wm:
            log.warning("No se pudieron guardar las métricas de WhisperX: %s", e_wm)

        _set_estado(conn, grabacion_id, "TRANSCRIBED")
        conn.commit()

        log.info("Transcripción guardada en BD | trans_id=%s | caracteres=%d | palabras≈%d",
                 trans_id, len(texto_completo), len(texto_completo.split()))

        # ----------------------------------------------------------
        # Encolar análisis LLM
        # ----------------------------------------------------------
        try:
            redis_conn = Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
            q_analysis = Queue("analysis", connection=redis_conn)
            q_analysis.enqueue(
                "rq_workers.llm_worker.extract_atenciones_job",
                str(grabacion_id),
                job_id=f"analysis_{grabacion_id}",
                result_ttl=3600,
                ttl=3600,
                failure_ttl=86400,
            )
            log.info("Job de análisis encolado correctamente.")
        except Exception:
            import traceback
            log.warning("No se pudo encolar job de análisis (no crítico):\n%s",
                        traceback.format_exc())

        t_total_elapsed = round(time.perf_counter() - t_total, 2)
        rtf_total = t_total_elapsed / max(audio_duration_sec, 0.1)

        log.info("=" * 60)
        log.info("FIN transcribe_job | Resumen:")
        log.info("  Grabacion:  %s", grabacion_id)
        log.info("  Audio:      %.1f s", audio_duration_sec)
        log.info("  Total:      %.1f s (RTF=%.2fx)", t_total_elapsed, rtf_total)
        log.info("  ASR:        %.1f s", t1_elapsed)
        log.info("  Alignment:  %.1f s", t2_elapsed)
        log.info("  Diarize:    %.1f s", t3_elapsed)
        log.info("  Assign:     %.1f s", t4_elapsed)
        log.info("  Segmentos:  %d | Speakers: %s", len(segments), sorted(speakers_detectados))
        log.info("  Palabras:   ~%d", n_words)
        log.info("=" * 60)

        # Monitoreo de recursos al final del job
        _log_system_resources("FIN-JOB")

        return {
            "grabacion_id":     grabacion_id,
            "audio_enhanced":   str(audio_path),
            "audio_duration_s": round(audio_duration_sec, 1),
            "device":           device,
            "model_size":       MODEL_SIZE,
            "lang":             language_code,
            "beam_size":        BEAM_SIZE,
            "segments":         len(segments),
            "words":            n_words,
            "speakers":         sorted(speakers_detectados),
            "t_total_sec":      t_total_elapsed,
            "t_asr_sec":        round(t1_elapsed, 2),
            "t_align_sec":      round(t2_elapsed, 2),
            "t_diarize_sec":    round(t3_elapsed, 2),
            "rtf":              round(rtf_total, 3),
        }

    except Exception:
        conn.rollback()
        try:
            _set_estado(conn, grabacion_id, "FAILED")
            conn.commit()
        except Exception:
            pass
        log.exception("Error en transcribe_job para grabacion_id=%s", grabacion_id)
        raise

    finally:
        try:
            conn.close()
        except Exception:
            pass
        
        # --- SOLUCION OOM EXTREMA ---
        log.info("Ejecutando limpieza forzada de memoria (GC + VRAM)...")
        import gc
        import torch
        # Limpiamos recolección de basura de Python
        gc.collect()
        # Vaciamos VRAM para evitar Out of Memory y Segmentation Faults (SIGKILL 139)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
        log.info("Memoria liberada exitosamente.")
