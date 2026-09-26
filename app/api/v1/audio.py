import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text  

import aiofiles
from redis import Redis
from rq import Queue

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.db.models import Usuario, Caja as CajaModel

import re
from datetime import datetime, timezone
from fastapi import HTTPException

from sqlalchemy import or_, func
from app.db.models import Contacto
from fastapi.responses import StreamingResponse
import time

# ============================================================
# Logger
# ============================================================
log = logging.getLogger(__name__)

router = APIRouter()

# ============================================================
# Redis / RQ
# ============================================================
redis_conn = Redis.from_url(settings.redis_url)
q_enhance = Queue("enhance", connection=redis_conn)

# ============================================================
# Storage
# ============================================================
STORAGE_ROOT = Path(settings.storage_root).resolve()
INCOMING_DIR = STORAGE_ROOT / "incoming"
ENHANCED_DIR = STORAGE_ROOT / "enhanced"

ALLOWED_EXT = {".wav", ".m4a", ".mp3", ".ogg", ".flac"}


# ============================================================
# Helpers
# ============================================================
def _safe(s: str, maxlen: int = 40) -> str:
    s = (s or "").strip()
    out = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in s)
    return out[:maxlen] if out else "NA"


async def _save_upload_streaming(upload: UploadFile, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(dst, "wb") as f:
        while True:
            chunk = await upload.read(1024 * 1024)  # 1MB
            if not chunk:
                break
            await f.write(chunk)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

_ISO_FIX_RE = re.compile(r"(\.\d{1,})Z$")  # fracción + Z al final

def _parse_iso_dt(s: str) -> datetime:
    try:
        s = (s or "").strip()
        if s.endswith("Z"):
            # Si trae fracción .1234567Z => recortar a 6 dígitos
            m = _ISO_FIX_RE.search(s)
            if m:
                frac = m.group(1)  # ".1234567"
                digits = frac[1:]
                if len(digits) > 6:
                    digits = digits[:6]
                s = _ISO_FIX_RE.sub(f".{digits}Z", s)

            s = s.replace("Z", "+00:00")

        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            # Si no tiene zona horaria, asumimos la hora local de Ecuador (UTC-5)
            ecuador_tz = timezone(timedelta(hours=-5))
            dt = dt.replace(tzinfo=ecuador_tz)
        return dt.astimezone(timezone.utc)

    except Exception:
        raise HTTPException(status_code=400, detail=f"Fecha inválida: {s}")

# ============================================================
# INGEST (ANTI-COLAPSO)
# ============================================================
@router.post("/audio/ingest")
async def ingest_audio(
    caja: str = Form(...),
    cajero: str = Form(...),
    started_at: str = Form(...),
    ended_at: str = Form(...),
    audio: UploadFile = File(...),
    _user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    API SOLO (ANTI-COLAPSO):
    - valida
    - guarda archivo
    - registra en BD
    - encola job (Redis/RQ)
    - responde rápido
    """

    try:
        # ================= VALIDACIONES =================
        if not audio.filename:
            raise HTTPException(status_code=400, detail="Archivo inválido")

        ext = Path(audio.filename).suffix.lower()
        if ext not in ALLOWED_EXT:
            raise HTTPException(status_code=400, detail=f"Formato no permitido: {ext}")

        dt_start = _parse_iso_dt(started_at)
        dt_end = _parse_iso_dt(ended_at)
        if dt_end <= dt_start:
            raise HTTPException(status_code=400, detail="ended_at debe ser mayor que started_at")

        dur_sec = int((dt_end - dt_start).total_seconds())
        if dur_sec <= 0:
            raise HTTPException(status_code=400, detail="Duración inválida")

        # ================= CAJA =================
        caja_clean = caja.strip()
        res_caja = await db.execute(
            select(CajaModel).where(CajaModel.nombre_identificador.ilike(caja_clean))
        )
        caja_row = res_caja.scalar_one_or_none()

        if not caja_row:
            raise HTTPException(status_code=404, detail=f"Caja no existe: {caja_clean}")
        if caja_row.activo is False:
            raise HTTPException(
                status_code=403,
                detail=f"Caja inactiva: {caja_clean} (id={caja_row.id})"
            )
            
        if caja_row.version_actual not in ("v2.0.0", "v2.0.1"):
            raise HTTPException(
                status_code=403,
                detail=f"Se requiere instalar la versión v2.0.0 en esta caja para grabar."
            )

        # ================= CAJERO =================
        cajero_clean = (cajero or "").strip()

        full_name_expr = func.lower(
            func.trim(func.concat(Contacto.nombre, " ", Contacto.apellido))
        )
        username_expr = func.lower(
            func.trim(func.concat(Contacto.nombre, "_", Contacto.apellido))
        )

        is_uuid = False
        try:
            uuid.UUID(cajero_clean)
            is_uuid = True
        except ValueError:
            pass

        conditions = [
            username_expr == func.lower(cajero_clean),
            full_name_expr == func.lower(cajero_clean)
        ]
        if is_uuid:
            conditions.append(Contacto.id == cajero_clean)

        stmt = select(Contacto).where(
            func.lower(Contacto.rol) == "cajero",
            or_(*conditions)
        )

        res_contact = await db.execute(stmt)
        matches = res_contact.scalars().all()

        if not matches:
            # Fallback to Usuario search to keep compatibility
            stmt_user = (
                select(Usuario)
                .join(Contacto, Usuario.contacto_id == Contacto.id)
                .where(
                    Usuario.activo.is_(True),
                    or_(
                        func.lower(func.trim(Usuario.username)) == func.lower(cajero_clean),
                        full_name_expr == func.lower(cajero_clean),
                    ),
                )
            )
            res_user = await db.execute(stmt_user)
            matches_user = res_user.scalars().all()
            if not matches_user:
                raise HTTPException(
                    status_code=404,
                    detail=f"Cajero no existe o está inactivo (username o nombre): {cajero_clean}"
                )
            cajero_user = matches_user[0]
            cajero_contact = cajero_user.contacto
        else:
            cajero_contact = matches[0]
            # See if this contact has a user account
            stmt_user = select(Usuario).where(Usuario.contacto_id == cajero_contact.id)
            res_user = await db.execute(stmt_user)
            cajero_user = res_user.scalars().first()

        # ================= PATHS =================
        grabacion_id = uuid.uuid4()
        yyyymmdd = dt_start.strftime("%Y%m%d")

        incoming_dir = INCOMING_DIR / yyyymmdd
        incoming_path = incoming_dir / f"{grabacion_id}{ext}"

        nombre_origen = (
            f"{dt_start.strftime('%Y%m%d_%H%M%S')}_"
            f"{_safe(caja_clean)}_{_safe(cajero_clean)}{ext}"
        )

        # ================= GUARDAR AUDIO =================
        await _save_upload_streaming(audio, incoming_path)

        # ================= INSERT BD =================
        await db.execute(
            text("""
            INSERT INTO public.grabaciones
            (id, usuario_id, contacto_id, caja_id, fecha_hora_inicio, fecha_hora_fin,
             duracion_segundos, nombre_archivo_origen, estado_proceso, created_at)
            VALUES
            (:id, :usuario_id, :contacto_id, :caja_id, :ini, :fin, :dur, :nombre, :estado, :created_at)
            """),
            {
                "id": str(grabacion_id),
                "usuario_id": str(cajero_user.id) if cajero_user else None,
                "contacto_id": str(cajero_contact.id),
                "caja_id": str(caja_row.id),
                "ini": dt_start,
                "fin": dt_end,
                "dur": dur_sec,
                "nombre": nombre_origen,
                "estado": "RECEIVED",
                "created_at": _utcnow(),
            }
        )
        await db.commit()

        # ================= ENCOLAR JOB DIRECTO A WHISPERX (BYPASS ENHANCE) =================
        try:
            q_whisperx = Queue("whisperx", connection=redis_conn)
            q_whisperx.enqueue(
                "whisperx_worker.whisperx_worker.transcribe_job",
                str(grabacion_id),
                yyyymmdd,
                job_id=f"whisperx_{grabacion_id}",
                result_ttl=3600,
                ttl=3600,
                failure_ttl=86400,
                job_timeout=1800,
            )

            await db.execute(
                text(
                    "UPDATE public.grabaciones "
                    "SET estado_proceso=:st WHERE id=:id"
                ),
                {"st": "WHISPERX_QUEUED", "id": str(grabacion_id)}
            )
            await db.commit()

        except Exception as e:
            log.exception(
                f"INGEST ENQUEUE ERROR: caja={caja}, cajero={cajero}, "
                f"started_at={started_at}, ended_at={ended_at}"
            )
            await db.execute(
                text(
                    "UPDATE public.grabaciones "
                    "SET estado_proceso=:st WHERE id=:id"
                ),
                {"st": "FAILED", "id": str(grabacion_id)}
            )
            await db.commit()
            raise HTTPException(
                status_code=500,
                detail=f"No se pudo encolar job: {type(e).__name__}: {e}"
            )

        return {
            "grabacion_id": str(grabacion_id),
            "estado": "ENHANCE_QUEUED",
        }

    # ================= LOGGING GLOBAL =================
    except HTTPException:
        log.error(
            f"INGEST HTTP ERROR: caja={caja}, cajero={cajero}, "
            f"started_at={started_at}, ended_at={ended_at}"
        )
        raise

    except Exception as e:
        log.exception(
            f"INGEST ERROR: caja={caja}, cajero={cajero}, "
            f"started_at={started_at}, ended_at={ended_at}"
        )
        raise HTTPException(
            status_code=500,
            detail=f"Error interno en ingest: {type(e).__name__}: {e}"
        )


# ============================================================
# STATUS
# ============================================================
@router.get("/audio/{grabacion_id}/status")
async def audio_status(
    grabacion_id: str,
    _user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        text(
            "SELECT id, estado_proceso, nombre_archivo_origen, "
            "fecha_hora_inicio, fecha_hora_fin, duracion_segundos "
            "FROM public.grabaciones WHERE id = :id"
        ),
        {"id": grabacion_id}
    )
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="grabacion_id no existe")

    return {
        "id": str(row[0]),
        "estado": row[1],
        "nombre_archivo_origen": row[2],
        "fecha_hora_inicio": row[3].isoformat() if row[3] else None,
        "fecha_hora_fin": row[4].isoformat() if row[4] else None,
        "duracion_segundos": row[5],
    }


# ============================================================
# DOWNLOAD ENHANCED
# ============================================================
@router.get("/audio/{grabacion_id}/enhanced")
async def download_enhanced(
    grabacion_id: str,
    db: AsyncSession = Depends(get_db),
):
    path = None
    try:
        res = await db.execute(
            text("SELECT fecha_hora_inicio FROM public.grabaciones WHERE id = :id"),
            {"id": grabacion_id}
        )
        row = res.first()
        if row and row[0]:
            yyyymmdd = row[0].strftime("%Y%m%d")
            p = ENHANCED_DIR / yyyymmdd / f"{grabacion_id}_ENH.wav"
            if p.exists():
                path = p
    except Exception:
        pass

    # Fallback: buscar físicamente en el directorio enhanced si la DB no lo tiene registrado
    if not path or not path.exists():
        matches = list(ENHANCED_DIR.glob(f"**/{grabacion_id}_ENH.wav"))
        if matches:
            path = matches[0]

    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Audio mejorado no encontrado en el servidor")

    # (opcional) “estabilidad” del archivo: espera 300ms y verifica que no crece
    size1 = path.stat().st_size
    time.sleep(0.3)
    size2 = path.stat().st_size
    if size2 != size1:
        raise HTTPException(status_code=409, detail="Audio mejorado aún se está generando. Reintenta en 2s.")

    return FileResponse(
        path=str(path),
        media_type="audio/wav",
        filename=f"{grabacion_id}_ENH.wav",
        content_disposition_type="inline"
    )


# ============================================================
# DOWNLOAD RAW
# ============================================================
@router.get("/audio/{grabacion_id}/raw")
async def download_raw(
    grabacion_id: str,
    db: AsyncSession = Depends(get_db),
):
    path = None
    try:
        res = await db.execute(
            text("SELECT fecha_hora_inicio FROM public.grabaciones WHERE id = :id"),
            {"id": grabacion_id}
        )
        row = res.first()
        if row and row[0]:
            yyyymmdd = row[0].strftime("%Y%m%d")
            for ext in ALLOWED_EXT:
                p = INCOMING_DIR / yyyymmdd / f"{grabacion_id}{ext}"
                if p.exists():
                    path = p
                    break
    except Exception:
        pass

    # Fallback: buscar físicamente en el directorio incoming por glob si la DB no lo tiene
    if not path or not path.exists():
        matches = list(INCOMING_DIR.glob(f"**/{grabacion_id}.*"))
        if matches:
            for m in matches:
                if m.suffix.lower() in ALLOWED_EXT:
                    path = m
                    break
            
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Audio original no encontrado en el servidor")

    filename = f"{grabacion_id}{path.suffix}"
    return FileResponse(
        path=str(path),
        media_type="audio/wav" if path.suffix == ".wav" else "audio/mpeg",
        filename=filename,
        content_disposition_type="inline"
    )
