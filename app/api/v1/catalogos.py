from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, update, func
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import datetime, timezone

from app.api.deps import get_current_user
from app.db.session import get_db
from app.db.models import Usuario, Caja, Rol, Contacto

router = APIRouter()

@router.get("/health")
async def health_check():
    return {"status": "ok", "message": "api/v1 is running"}

class CajeroOut(BaseModel):
    id: str
    username: str
    nombre_completo: str
    activo: bool

class CajaOut(BaseModel):
    id: str
    nombre_identificador: str
    ubicacion: str | None = None
    activo: bool | None = None
    en_uso: bool | None = None
    ultima_conexion: datetime | None = None
    estado_grabacion: str | None = None
    version_actual: str | None = None

@router.get("/usuarios/cajeros", response_model=list[CajeroOut])
async def get_cajeros(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Query contacts with role Cajero
    stmt = select(Contacto).where(func.lower(Contacto.rol) == "cajero")
    res = await db.execute(stmt)
    contactos = res.scalars().all()

    # Get list of contact IDs currently assigned to any Caja
    in_use_stmt = select(Caja.contacto_id).where(Caja.contacto_id != None)
    in_use_res = await db.execute(in_use_stmt)
    in_use_ids = set(in_use_res.scalars().all())

    out: list[CajeroOut] = []
    for c in contactos:
        if c.id in in_use_ids:
            continue
            
        nombre = f"{c.nombre or ''} {c.apellido or ''}".strip()
        username = f"{c.nombre or ''}_{c.apellido or ''}".strip("_").lower() or "cajero"
        
        out.append(CajeroOut(
            id=str(c.id),
            username=username,
            nombre_completo=nombre,
            activo=True,
        ))
    return out


@router.get("/cajas", response_model=list[CajaOut])
async def get_cajas(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Caja).where(Caja.en_uso == False))
    cajas = res.scalars().all()
    return [
        CajaOut(
            id=str(c.id),
            nombre_identificador=c.nombre_identificador,
            ubicacion=c.ubicacion,
            activo=c.activo,
            en_uso=c.en_uso,
            ultima_conexion=c.ultima_conexion,
            estado_grabacion=c.estado_grabacion,
            version_actual=c.version_actual,
        )
        for c in cajas
    ]

@router.get("/cajas/todas", response_model=list[CajaOut])
async def get_todas_cajas(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Caja))
    cajas = res.scalars().all()
    return [
        CajaOut(
            id=str(c.id),
            nombre_identificador=c.nombre_identificador,
            ubicacion=c.ubicacion,
            activo=c.activo,
            en_uso=c.en_uso,
            ultima_conexion=c.ultima_conexion,
            estado_grabacion=c.estado_grabacion,
            version_actual=c.version_actual,
        )
        for c in cajas
    ]

class PingPayload(BaseModel):
    is_recording: bool = False
    estado_grabacion: Optional[str] = None
    lista_microfonos: Optional[list[str]] = None
    en_pausa_override: Optional[bool] = None
    grabacion_habilitada_override: Optional[bool] = None
    microfono_actual_override: Optional[str] = None
    horarios_override: Optional[dict] = None
    duracion_segmento_minutos_override: Optional[int] = None
    version: Optional[str] = None

@router.post("/cajas/{caja_id}/ping")
async def ping_caja(
    caja_id: str,
    payload: PingPayload = None,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Obtener caja
    result = await db.execute(select(Caja).where(Caja.id == caja_id))
    db_caja = result.scalars().first()
    
    if not db_caja:
        raise HTTPException(status_code=404, detail="Caja no encontrada")

    db_caja.ultima_conexion = datetime.now(timezone.utc)
    if payload:
        db_caja.en_uso = payload.is_recording
        if payload.estado_grabacion is not None:
            db_caja.estado_grabacion = payload.estado_grabacion
        if payload.lista_microfonos is not None:
            db_caja.lista_microfonos = payload.lista_microfonos
        if payload.en_pausa_override is not None:
            db_caja.en_pausa = payload.en_pausa_override
        if payload.grabacion_habilitada_override is not None:
            db_caja.grabacion_habilitada = payload.grabacion_habilitada_override
        if payload.microfono_actual_override is not None:
            db_caja.microfono_asignado = payload.microfono_actual_override
        if payload.horarios_override is not None:
            ho = payload.horarios_override
            if "turno_manana_inicio" in ho and ho["turno_manana_inicio"]:
                try: db_caja.turno_manana_inicio = datetime.strptime(ho["turno_manana_inicio"], "%H:%M:%S").time()
                except: pass
            if "turno_manana_fin" in ho and ho["turno_manana_fin"]:
                try: db_caja.turno_manana_fin = datetime.strptime(ho["turno_manana_fin"], "%H:%M:%S").time()
                except: pass
            if "turno_tarde_inicio" in ho and ho["turno_tarde_inicio"]:
                try: db_caja.turno_tarde_inicio = datetime.strptime(ho["turno_tarde_inicio"], "%H:%M:%S").time()
                except: pass
            if "turno_tarde_fin" in ho and ho["turno_tarde_fin"]:
                try: db_caja.turno_tarde_fin = datetime.strptime(ho["turno_tarde_fin"], "%H:%M:%S").time()
                except: pass
        if payload.duracion_segmento_minutos_override is not None:
            db_caja.duracion_segmento_minutos = payload.duracion_segmento_minutos_override
        if payload.version is not None:
            db_caja.version_actual = payload.version

    await db.commit()
    await db.refresh(db_caja)
    
    cajero_nombre = "SIN_ASIGNAR"
    if db_caja.contacto_id:
        res_contact = await db.execute(select(Contacto).where(Contacto.id == db_caja.contacto_id))
        contact = res_contact.scalars().first()
        if contact:
            cajero_nombre = f"{contact.nombre or ''} {contact.apellido or ''}".strip() or "SIN_ASIGNAR"
    
    # Check version
    require_update = False
    if payload and payload.version != "v2.0.0":
        require_update = True
    
    return {
        "status": "ok", 
        "require_update": require_update,
        "caja_id": caja_id, 
        "estado_operativo": db_caja.estado_operativo,
        "estado_grabacion": db_caja.estado_grabacion,
        "contacto_id": str(db_caja.contacto_id) if db_caja.contacto_id else None,
        "cajero_nombre": cajero_nombre,
        "turno_manana_inicio": db_caja.turno_manana_inicio.isoformat() if db_caja.turno_manana_inicio else "07:30:00",
        "turno_manana_fin": db_caja.turno_manana_fin.isoformat() if db_caja.turno_manana_fin else "12:00:00",
        "turno_tarde_inicio": db_caja.turno_tarde_inicio.isoformat() if db_caja.turno_tarde_inicio else "16:00:00",
        "turno_tarde_fin": db_caja.turno_tarde_fin.isoformat() if db_caja.turno_tarde_fin else "19:00:00",
        "grabacion_habilitada": db_caja.grabacion_habilitada,
        "en_pausa": db_caja.en_pausa,
        "duracion_segmento_minutos": db_caja.duracion_segmento_minutos,
        "microfono_asignado": db_caja.microfono_asignado
    }

class AsignarConfigRequest(BaseModel):
    caja_id_nueva: str
    cajero_id_nuevo: str
    caja_id_anterior: Optional[str] = None
    cajero_id_anterior: Optional[str] = None
    estado_operativo: Optional[str] = None

@router.post("/asignar_configuracion")
async def asignar_configuracion(
    req: AsignarConfigRequest,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Liberar los anteriores si existen
    if req.caja_id_anterior:
        await db.execute(update(Caja).where(Caja.id == req.caja_id_anterior).values(en_uso=False, contacto_id=None))
    if req.cajero_id_anterior:
        # Podria ser de un Usuario o de un Contacto directamente
        await db.execute(update(Usuario).where(Usuario.id == req.cajero_id_anterior).values(en_uso=False))
        await db.execute(update(Usuario).where(Usuario.contacto_id == req.cajero_id_anterior).values(en_uso=False))
        
    # Asignar los nuevos
    resolved_contact_id = None
    resolved_user_id = None

    if req.cajero_id_nuevo:
        # Intentar ver si es un Usuario
        user_res = await db.execute(select(Usuario).where(Usuario.id == req.cajero_id_nuevo))
        user_obj = user_res.scalars().first()
        if user_obj:
            resolved_user_id = user_obj.id
            resolved_contact_id = user_obj.contacto_id
        else:
            # Ver si es un Contacto
            contact_res = await db.execute(select(Contacto).where(Contacto.id == req.cajero_id_nuevo))
            contact_obj = contact_res.scalars().first()
            if contact_obj:
                resolved_contact_id = contact_obj.id
                # Buscar usuario asociado a este contacto
                user_res = await db.execute(select(Usuario).where(Usuario.contacto_id == contact_obj.id))
                user_obj = user_res.scalars().first()
                if user_obj:
                    resolved_user_id = user_obj.id

    if req.caja_id_nueva:
        update_data = {}
        if req.estado_operativo:
            if req.estado_operativo == "Mantenimiento":
                update_data["estado_operativo"] = "En Mantenimiento"
            else:
                update_data["estado_operativo"] = req.estado_operativo
            
        if update_data.get("estado_operativo") in ["En Mantenimiento", "Fuera de Servicio"]:
            update_data["contacto_id"] = None
        else:
            update_data["contacto_id"] = resolved_contact_id
            
        await db.execute(update(Caja).where(Caja.id == req.caja_id_nueva).values(**update_data))
        
    if resolved_user_id:
        await db.execute(update(Usuario).where(Usuario.id == resolved_user_id).values(en_uso=True))
        
    await db.commit()
    return {"status": "ok"}
