import os
import re
import time
import uuid
import shutil
import subprocess
from pathlib import Path
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
from redis import Redis
from rq import Queue

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

load_dotenv()

# -----------------------
# CONFIG
# -----------------------
WATCH_DIR = Path(os.getenv("WATCH_DIR", "watch/incoming")).resolve()
PROCESSED_DIR = Path(os.getenv("WATCH_PROCESSED_DIR", "watch/processed")).resolve()
FAILED_DIR = Path(os.getenv("WATCH_FAILED_DIR", "watch/failed")).resolve()
POLL_SEC = int(os.getenv("WATCH_POLL_SEC", "3"))

DEFAULT_CAJA = os.getenv("DEFAULT_CAJA", "Caja01").strip()
DEFAULT_CAJERO = os.getenv("DEFAULT_CAJERO", "cajero01").strip()

FFPROBE = os.getenv("FFPROBE_BIN", "ffprobe")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

STORAGE_ROOT = Path(os.getenv("STORAGE_ROOT", "storage")).resolve()
INCOMING_DIR = STORAGE_ROOT / "incoming"

ALLOWED_EXT = {".wav", ".m4a", ".mp3", ".ogg", ".flac"}

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("Falta DATABASE_URL en .env")

# Si es async, lo convertimos para sync
DATABASE_URL_SYNC = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)

engine = create_engine(DATABASE_URL_SYNC, pool_pre_ping=True, pool_recycle=1800, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

redis_conn = Redis.from_url(REDIS_URL)
q_enhance = Queue("enhance", connection=redis_conn)

# -----------------------
# HELPERS
# -----------------------
def utcnow():
    return datetime.now(timezone.utc)

def ensure_dirs():
    WATCH_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    FAILED_DIR.mkdir(parents=True, exist_ok=True)
    INCOMING_DIR.mkdir(parents=True, exist_ok=True)

def is_stable_file(p: Path, wait_ms: int = 400) -> bool:
    """Evita agarrar un archivo mientras todavía lo están copiando."""
    try:
        s1 = p.stat().st_size
        time.sleep(wait_ms / 1000)
        s2 = p.stat().st_size
        return s1 == s2 and s1 > 0
    except Exception:
        return False

def ffprobe_duration_seconds(path: Path) -> int:
    cmd = [
        FFPROBE, "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path)
    ]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"ffprobe falló: {p.stderr.strip()}")
    dur = float((p.stdout or "0").strip() or 0)
    return max(1, int(round(dur)))

# Convención recomendada:
#   Caja01__cajero01__20260226_150000.wav
NAME_RE = re.compile(
    r"^(?P<caja>[^_]+)__(?P<cajero>[^_]+)__(?P<dt>\d{8}_\d{6})$",
    re.IGNORECASE
)

def parse_metadata_from_filename(p: Path):
    m = NAME_RE.match(p.stem)
    if not m:
        return None
    caja = m.group("caja")
    cajero = m.group("cajero")
    # Asumimos que la hora del nombre del archivo es hora local de Ecuador (UTC-5)
    # y la convertimos a UTC para almacenar correctamente en la BD
    dt_naive = datetime.strptime(m.group("dt"), "%Y%m%d_%H%M%S")
    ecuador_tz = timezone(timedelta(hours=-5))
    dt = dt_naive.replace(tzinfo=ecuador_tz).astimezone(timezone.utc)
    return caja, cajero, dt

def db_lookup_caja(db, caja_name: str) -> tuple[str, bool]:
    row = db.execute(
        text("""
            SELECT id::text, activo
            FROM public.cajas
            WHERE lower(nombre_identificador)=lower(:c)
            LIMIT 1
        """),
        {"c": caja_name.strip()}
    ).first()
    if not row:
        raise RuntimeError(f"Caja no existe: {caja_name}")
    return row[0], bool(row[1])

def db_lookup_cajero(db, cajero_name: str) -> tuple[str, str | None, bool]:
    cajero_clean = cajero_name.strip()
    
    # 1. Buscar en Contacto
    row = db.execute(
        text("""
            SELECT id::text, rol
            FROM public.contactos
            WHERE lower(rol) = 'cajero' AND (
                lower(nombre) = lower(:c) OR
                lower(apellido) = lower(:c) OR
                lower(nombre || '_' || apellido) = lower(:c) OR
                lower(nombre || ' ' || apellido) = lower(:c)
            )
            LIMIT 1
        """),
        {"c": cajero_clean}
    ).first()
    if row:
        contact_id = row[0]
        # Ver si tiene usuario asociado
        user_row = db.execute(
            text("SELECT id::text, activo FROM public.usuarios WHERE contacto_id = CAST(:cid AS uuid) LIMIT 1"),
            {"cid": contact_id}
        ).first()
        if user_row:
            return contact_id, user_row[0], bool(user_row[1])
        return contact_id, None, True

    # 2. Fallback a Usuario
    user_row = db.execute(
        text("""
            SELECT u.id::text, u.contacto_id::text, u.activo
            FROM public.usuarios u
            WHERE lower(username)=lower(:u)
            LIMIT 1
        """),
        {"u": cajero_clean}
    ).first()
    if not user_row:
        raise RuntimeError(f"Cajero no existe (username o contacto): {cajero_name}")
    return user_row[1], user_row[0], bool(user_row[2])

def ingest_one_file(p: Path) -> str:
    ext = p.suffix.lower()
    if ext not in ALLOWED_EXT:
        raise RuntimeError(f"Formato no permitido: {ext}")

    meta = parse_metadata_from_filename(p)
    if meta:
        caja, cajero, dt_start = meta
    else:
        caja, cajero = DEFAULT_CAJA, DEFAULT_CAJERO
        dt_start = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc)

    dur_sec = ffprobe_duration_seconds(p)
    dt_end = dt_start + timedelta(seconds=dur_sec)
    yyyymmdd = dt_start.strftime("%Y%m%d")

    grabacion_id = str(uuid.uuid4())
    incoming_dir = INCOMING_DIR / yyyymmdd
    incoming_dir.mkdir(parents=True, exist_ok=True)
    incoming_path = incoming_dir / f"{grabacion_id}{ext}"

    # Copia el audio a storage/incoming
    shutil.copy2(p, incoming_path)

    with SessionLocal() as db:
        caja_id, caja_activa = db_lookup_caja(db, caja)
        if not caja_activa:
            raise RuntimeError(f"Caja inactiva: {caja} (id={caja_id})")

        contacto_id, usuario_id, active = db_lookup_cajero(db, cajero)
        if not active:
            raise RuntimeError(f"Cajero inactivo: {cajero}")

        # Insert a grabaciones (tu esquema exacto)
        db.execute(
            text("""
                INSERT INTO public.grabaciones
                (id, usuario_id, contacto_id, caja_id, fecha_hora_inicio, fecha_hora_fin,
                duracion_segundos, nombre_archivo_origen, estado_proceso, created_at)
                VALUES
                (:id, :usuario_id, :contacto_id, :caja_id, :ini, :fin, :dur, :nombre, :estado, :created_at)
            """),
            {
                "id": grabacion_id,
                "usuario_id": usuario_id,
                "contacto_id": contacto_id,
                "caja_id": caja_id,
                "ini": dt_start,
                "fin": dt_end,
                "dur": dur_sec,
                "nombre": p.name,
                "estado": "RECEIVED",
                "created_at": utcnow(),
            }
        )


        db.commit()

        # Encola Enhance exactamente como tu API
        q_enhance.enqueue(
            "rq_workers.enhance_worker.enhance_job",
            grabacion_id,
            str(incoming_path),
            yyyymmdd,
            job_id=grabacion_id,
            result_ttl=3600,
            ttl=3600,
            failure_ttl=86400,
        )

        db.execute(
            text("UPDATE public.grabaciones SET estado_proceso=:st WHERE id=:id"),
            {"st": "ENHANCE_QUEUED", "id": grabacion_id}
        )
        db.commit()

    return grabacion_id

def main():
    ensure_dirs()
    print(f"[folder_ingest] WATCH_DIR={WATCH_DIR}")
    print(f"[folder_ingest] PROCESSED_DIR={PROCESSED_DIR}")
    print(f"[folder_ingest] FAILED_DIR={FAILED_DIR}")
    print(f"[folder_ingest] DEFAULT_CAJA={DEFAULT_CAJA}")
    print(f"[folder_ingest] DEFAULT_CAJERO={DEFAULT_CAJERO}")
    print(f"[folder_ingest] POLL_SEC={POLL_SEC}")

    while True:
        try:
            files = sorted([p for p in WATCH_DIR.iterdir() if p.is_file()])
            for p in files:
                if p.suffix.lower() not in ALLOWED_EXT:
                    continue
                if not is_stable_file(p):
                    continue

                try:
                    gid = ingest_one_file(p)
                    shutil.move(str(p), str(PROCESSED_DIR / p.name))
                    print(f"OK   {p.name} -> grabacion_id={gid}")
                except Exception as e:
                    try:
                        shutil.move(str(p), str(FAILED_DIR / p.name))
                    except Exception:
                        pass
                    print(f"FAIL {p.name}: {type(e).__name__}: {e}")

        except Exception as e:
            print(f"[folder_ingest] loop error: {type(e).__name__}: {e}")

        time.sleep(POLL_SEC)

if __name__ == "__main__":
    main()