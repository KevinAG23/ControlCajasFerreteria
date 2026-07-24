from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, delete, func
from sqlalchemy.orm import selectinload, joinedload

import models
import schemas
import auth
import re
import unicodedata

from uuid import UUID

def sanitize_username(name: str) -> str:
    n = ''.join(c for c in unicodedata.normalize('NFD', name) if unicodedata.category(c) != 'Mn')
    n = n.lower().strip()
    n = re.sub(r'[^a-z0-9_]', '_', n)
    return re.sub(r'_+', '_', n).strip('_')

async def auto_create_usuario_for_contacto(db: AsyncSession, contact: models.Contacto):
    if not contact.rol or contact.rol.lower() not in ["cajero", "administrador"]:
        return None
    
    # Check if user already exists for this contact
    existing_user_query = select(models.Usuario).where(models.Usuario.contacto_id == contact.id)
    res = await db.execute(existing_user_query)
    existing_user = res.scalars().first()
    
    contact_rol_lower = contact.rol.lower()
    
    # Find or create role
    role_query = select(models.Rol).where(func.lower(models.Rol.nombre) == contact_rol_lower)
    res_role = await db.execute(role_query)
    role = res_role.scalars().first()
    if not role:
        role_name = contact.rol.capitalize()
        role = models.Rol(nombre=role_name)
        db.add(role)
        await db.flush()

    if existing_user:
        # If user exists but role has changed, update the user's role
        if existing_user.rol_id != role.id:
            existing_user.rol_id = role.id
            await db.commit()
            await db.refresh(existing_user)
        return existing_user
        
    # Generate unique username
    first = sanitize_username(contact.nombre or "")
    last = sanitize_username(contact.apellido or "")
    base_username = f"{first}_{last}".strip("_") or contact_rol_lower
    
    username = base_username
    suffix = 1
    while True:
        check_user = await db.execute(select(models.Usuario).where(models.Usuario.username == username))
        if not check_user.scalars().first():
            break
        username = f"{base_username}_{suffix}"
        suffix += 1
        
    default_pwd = "Admin123!" if contact_rol_lower == "administrador" else "Cajero123!"
    hashed_pwd = auth.get_password_hash(default_pwd)
    
    new_user = models.Usuario(
        username=username,
        password_hash=hashed_pwd,
        rol_id=role.id,
        contacto_id=contact.id,
        activo=True,
        en_uso=False
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

# ---- CONTACTOS ----
async def get_contactos(db: AsyncSession, skip: int = 0, limit: int = 100):
    result = await db.execute(select(models.Contacto).offset(skip).limit(limit))
    return result.scalars().all()

async def create_contacto(db: AsyncSession, contacto: schemas.ContactoCreate, user_id: UUID = None):
    db_contacto = models.Contacto(**contacto.model_dump(), creado_por_uid=user_id)
    db.add(db_contacto)
    await db.commit()
    await db.refresh(db_contacto)
    return db_contacto

async def update_contacto(db: AsyncSession, contacto_id: UUID, contacto: schemas.ContactoUpdate, user_id: UUID = None):
    query = select(models.Contacto).where(models.Contacto.id == contacto_id)
    result = await db.execute(query)
    db_contacto = result.scalars().first()
    if db_contacto:
        update_data = contacto.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_contacto, key, value)
        db_contacto.actualizado_por_uid = user_id
        await db.commit()
        await db.refresh(db_contacto)
    return db_contacto

async def delete_contacto(db: AsyncSession, contacto_id: UUID):
    await db.execute(
        update(models.Caja)
        .where(models.Caja.contacto_id == contacto_id)
        .values(contacto_id=None, en_uso=False)
    )
    res_user = await db.execute(select(models.Usuario).where(models.Usuario.contacto_id == contacto_id))
    db_user = res_user.scalars().first()
    if db_user:
        await db.delete(db_user)
    query = delete(models.Contacto).where(models.Contacto.id == contacto_id)
    await db.execute(query)
    await db.commit()

# ---- USUARIOS ----
async def get_usuarios(db: AsyncSession, skip: int = 0, limit: int = 100):
    result = await db.execute(
        select(models.Usuario)
        .options(selectinload(models.Usuario.rol), selectinload(models.Usuario.contacto))
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()

async def create_usuario(db: AsyncSession, usuario: schemas.UsuarioCreate, creator_id: UUID = None):
    hashed_password = auth.get_password_hash(usuario.password)
    db_usuario = models.Usuario(
        username=usuario.username,
        password_hash=hashed_password,
        rol_id=usuario.rol_id,
        contacto_id=usuario.contacto_id,
        activo=usuario.activo,
        creado_por_uid=creator_id
    )
    db.add(db_usuario)
    await db.commit()
    await db.refresh(db_usuario)
    query = select(models.Usuario).where(models.Usuario.id == db_usuario.id).options(selectinload(models.Usuario.rol), selectinload(models.Usuario.contacto))
    result = await db.execute(query)
    return result.scalars().first()

async def update_usuario(db: AsyncSession, usuario_id: UUID, usuario: schemas.UsuarioUpdate, editor_id: UUID = None):
    query = select(models.Usuario).where(models.Usuario.id == usuario_id).options(selectinload(models.Usuario.rol), selectinload(models.Usuario.contacto))
    result = await db.execute(query)
    db_usuario = result.scalars().first()
    if db_usuario:
        update_data = usuario.model_dump(exclude_unset=True)
        if "password" in update_data:
            update_data["password_hash"] = auth.get_password_hash(update_data.pop("password"))
        for key, value in update_data.items():
            setattr(db_usuario, key, value)
        db_usuario.actualizado_por_uid = editor_id
        await db.commit()
        await db.refresh(db_usuario)
    return db_usuario

async def delete_usuario(db: AsyncSession, usuario_id: UUID):
    res_user = await db.execute(select(models.Usuario).where(models.Usuario.id == usuario_id))
    db_user = res_user.scalars().first()
    if db_user and db_user.contacto_id:
        await db.execute(
            update(models.Caja)
            .where(models.Caja.contacto_id == db_user.contacto_id)
            .values(contacto_id=None, en_uso=False)
        )
    query = delete(models.Usuario).where(models.Usuario.id == usuario_id)
    await db.execute(query)
    await db.commit()

# ---- CAJAS ----
async def get_cajas(db: AsyncSession, skip: int = 0, limit: int = 100):
    result = await db.execute(
        select(models.Caja)
        .options(selectinload(models.Caja.contacto))
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()

async def create_caja(db: AsyncSession, caja: schemas.CajaCreate):
    db_caja = models.Caja(**caja.model_dump())
    db.add(db_caja)
    await db.commit()
    await db.refresh(db_caja)
    if db_caja.contacto_id:
        db_caja.en_uso = True
        res_u = await db.execute(select(models.Usuario).where(models.Usuario.contacto_id == db_caja.contacto_id))
        user = res_u.scalars().first()
        if user:
            user.en_uso = True
        await db.commit()
        await db.refresh(db_caja)
    query = select(models.Caja).where(models.Caja.id == db_caja.id).options(selectinload(models.Caja.contacto))
    result = await db.execute(query)
    return result.scalars().first()

async def update_caja(db: AsyncSession, caja_id: UUID, caja: schemas.CajaUpdate):
    query = select(models.Caja).where(models.Caja.id == caja_id).options(selectinload(models.Caja.contacto))
    result = await db.execute(query)
    db_caja = result.scalars().first()
    if db_caja:
        old_contacto_id = db_caja.contacto_id
        update_data = caja.model_dump(exclude_unset=True)
        if update_data.get("estado_operativo") in ["Mantenimiento", "En Mantenimiento", "Fuera de Servicio"]:
            if update_data.get("estado_operativo") == "Mantenimiento":
                update_data["estado_operativo"] = "En Mantenimiento"
            update_data["contacto_id"] = None
            update_data["en_uso"] = False
            
        for key, value in update_data.items():
            setattr(db_caja, key, value)
            
        new_contacto_id = db_caja.contacto_id
        if old_contacto_id != new_contacto_id:
            if old_contacto_id:
                res_u = await db.execute(select(models.Usuario).where(models.Usuario.contacto_id == old_contacto_id))
                old_user = res_u.scalars().first()
                if old_user:
                    old_user.en_uso = False
            if new_contacto_id:
                db_caja.en_uso = True
                res_u = await db.execute(select(models.Usuario).where(models.Usuario.contacto_id == new_contacto_id))
                new_user = res_u.scalars().first()
                if new_user:
                    new_user.en_uso = True
            else:
                db_caja.en_uso = False
                
        await db.commit()
        await db.refresh(db_caja)
    return db_caja

async def delete_caja(db: AsyncSession, caja_id: UUID):
    res_caja = await db.execute(select(models.Caja).where(models.Caja.id == caja_id))
    db_caja = res_caja.scalars().first()
    if db_caja and db_caja.contacto_id:
        res_u = await db.execute(select(models.Usuario).where(models.Usuario.contacto_id == db_caja.contacto_id))
        user = res_u.scalars().first()
        if user:
            user.en_uso = False
    query = delete(models.Caja).where(models.Caja.id == caja_id)
    await db.execute(query)
    await db.commit()

# ---- CATEGORIAS PREGUNTAS ----
async def get_categorias_preguntas(db: AsyncSession, skip: int = 0, limit: int = 100):
    result = await db.execute(select(models.CategoriaPregunta).offset(skip).limit(limit))
    return result.scalars().all()

async def create_categoria_pregunta(db: AsyncSession, categoria: schemas.CategoriaPreguntaCreate):
    db_categoria = models.CategoriaPregunta(**categoria.model_dump())
    db.add(db_categoria)
    await db.commit()
    await db.refresh(db_categoria)
    return db_categoria

async def update_categoria_pregunta(db: AsyncSession, categoria_id: UUID, categoria: schemas.CategoriaPreguntaUpdate):
    query = select(models.CategoriaPregunta).where(models.CategoriaPregunta.id == categoria_id)
    result = await db.execute(query)
    db_categoria = result.scalars().first()
    if db_categoria:
        update_data = categoria.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_categoria, key, value)
        await db.commit()
        await db.refresh(db_categoria)
    return db_categoria

async def delete_categoria_pregunta(db: AsyncSession, categoria_id: UUID):
    query = delete(models.CategoriaPregunta).where(models.CategoriaPregunta.id == categoria_id)
    await db.execute(query)
    await db.commit()

# ---- CATALOGO PREGUNTAS ----
async def get_catalogo_preguntas(db: AsyncSession, skip: int = 0, limit: int = 100):
    result = await db.execute(
        select(models.CatalogoPreguntas)
        .options(joinedload(models.CatalogoPreguntas.categoria))
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()

async def create_catalogo_pregunta(db: AsyncSession, pregunta: schemas.CatalogoPreguntaCreate):
    db_pregunta = models.CatalogoPreguntas(**pregunta.model_dump())
    db.add(db_pregunta)
    await db.commit()
    await db.refresh(db_pregunta)
    query = select(models.CatalogoPreguntas).where(models.CatalogoPreguntas.id == db_pregunta.id).options(selectinload(models.CatalogoPreguntas.categoria))
    result = await db.execute(query)
    return result.scalars().first()

async def update_catalogo_pregunta(db: AsyncSession, pregunta_id: UUID, pregunta: schemas.CatalogoPreguntaUpdate):
    query = select(models.CatalogoPreguntas).where(models.CatalogoPreguntas.id == pregunta_id)
    result = await db.execute(query)
    db_pregunta = result.scalars().first()
    if db_pregunta:
        update_data = pregunta.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_pregunta, key, value)
        await db.commit()
        await db.refresh(db_pregunta)
        query = select(models.CatalogoPreguntas).where(models.CatalogoPreguntas.id == db_pregunta.id).options(selectinload(models.CatalogoPreguntas.categoria))
        result = await db.execute(query)
        return result.scalars().first()
    return db_pregunta

async def delete_catalogo_pregunta(db: AsyncSession, pregunta_id: UUID):
    query = delete(models.CatalogoPreguntas).where(models.CatalogoPreguntas.id == pregunta_id)
    await db.execute(query)
    await db.commit()

# ---- GRABACIONES ----
async def get_grabaciones(db: AsyncSession, skip: int = 0, limit: int = 100):
    result = await db.execute(
        select(models.Grabacion)
        .options(
            selectinload(models.Grabacion.usuario).selectinload(models.Usuario.contacto), 
            selectinload(models.Grabacion.usuario).selectinload(models.Usuario.rol), 
            selectinload(models.Grabacion.contacto),
            selectinload(models.Grabacion.caja).selectinload(models.Caja.contacto),
            selectinload(models.Grabacion.analisis),
        )
        .order_by(models.Grabacion.fecha_hora_inicio.desc())
        .offset(skip).limit(limit)
    )
    return result.scalars().all()

async def get_grabaciones_by_caja(db: AsyncSession, caja_id: UUID, limit: int = 100):
    result = await db.execute(
        select(models.Grabacion)
        .where(models.Grabacion.caja_id == caja_id)
        .options(
            selectinload(models.Grabacion.usuario).selectinload(models.Usuario.contacto),
            selectinload(models.Grabacion.usuario).selectinload(models.Usuario.rol),
            selectinload(models.Grabacion.contacto),
            selectinload(models.Grabacion.caja).selectinload(models.Caja.contacto),
            selectinload(models.Grabacion.analisis),
        )
        .order_by(models.Grabacion.fecha_hora_inicio.desc())
        .limit(limit)
    )
    return result.scalars().all()

async def get_grabaciones_by_usuario(db: AsyncSession, usuario_id: UUID, limit: int = 100):
    result = await db.execute(
        select(models.Grabacion)
        .where((models.Grabacion.usuario_id == usuario_id) | (models.Grabacion.contacto_id == usuario_id))
        .options(
            selectinload(models.Grabacion.usuario).selectinload(models.Usuario.contacto),
            selectinload(models.Grabacion.usuario).selectinload(models.Usuario.rol),
            selectinload(models.Grabacion.contacto),
            selectinload(models.Grabacion.caja).selectinload(models.Caja.contacto),
            selectinload(models.Grabacion.analisis),
        )
        .order_by(models.Grabacion.fecha_hora_inicio.desc())
        .limit(limit)
    )
    return result.scalars().all()

async def get_grabacion(db: AsyncSession, grabacion_id: UUID):
    result = await db.execute(
        select(models.Grabacion)
        .where(models.Grabacion.id == grabacion_id)
        .options(
            selectinload(models.Grabacion.usuario).selectinload(models.Usuario.contacto), 
            selectinload(models.Grabacion.usuario).selectinload(models.Usuario.rol), 
            selectinload(models.Grabacion.contacto),
            selectinload(models.Grabacion.caja).selectinload(models.Caja.contacto)
        )
    )
    return result.scalars().first()

# ---- TRANSCRIPCIONES ----
async def get_transcripciones(db: AsyncSession, grabacion_id: UUID = None):
    query = select(models.Transcripcion).options(selectinload(models.Transcripcion.segmentos))
    if grabacion_id:
        query = query.where(models.Transcripcion.grabacion_id == grabacion_id)
    result = await db.execute(query)
    return result.scalars().all()

# ---- ANALISIS ----
async def get_analisis(db: AsyncSession, grabacion_id: UUID = None):
    query = select(models.AnalisisGeneral).options(
        selectinload(models.AnalisisGeneral.respuestas)
        .selectinload(models.RespuestaEvaluacion.pregunta)
        .selectinload(models.CatalogoPreguntas.categoria)
    )
    if grabacion_id:
        query = query.where(
            (models.AnalisisGeneral.grabacion_id == grabacion_id) |
            (models.AnalisisGeneral.atencion_id.in_(
                select(models.Atencion.id).where(models.Atencion.grabacion_id == grabacion_id)
            ))
        )
    result = await db.execute(query)
    return result.scalars().all()

async def get_analisis_by_id(db: AsyncSession, analisis_id: UUID):
    query = select(models.AnalisisGeneral).where(models.AnalisisGeneral.id == analisis_id).options(
        selectinload(models.AnalisisGeneral.respuestas)
        .selectinload(models.RespuestaEvaluacion.pregunta)
        .selectinload(models.CatalogoPreguntas.categoria)
    )
    result = await db.execute(query)
    return result.scalars().first()

async def update_analisis(db: AsyncSession, analisis_id: UUID, analisis_update: schemas.AnalisisGeneralUpdate):
    query = select(models.AnalisisGeneral).where(models.AnalisisGeneral.id == analisis_id)
    result = await db.execute(query)
    db_analisis = result.scalars().first()
    if db_analisis:
        update_data = analisis_update.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_analisis, key, value)
        await db.commit()
        await db.refresh(db_analisis)
        # Reload with relationships
        return await get_analisis_by_id(db, db_analisis.id)
    return None

async def update_respuesta(db: AsyncSession, respuesta_id: UUID, respuesta_update: schemas.RespuestaEvaluacionUpdate):
    query = select(models.RespuestaEvaluacion).where(models.RespuestaEvaluacion.id == respuesta_id)
    result = await db.execute(query)
    db_respuesta = result.scalars().first()
    if db_respuesta:
        update_data = respuesta_update.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_respuesta, key, value)
        await db.commit()
        await db.refresh(db_respuesta)
    return db_respuesta

# ---- ESTADO BUFFER CAJAS ----
async def get_buffer_caja(db: AsyncSession, caja_id: UUID):
    result = await db.execute(select(models.EstadoBufferCaja).where(models.EstadoBufferCaja.caja_id == caja_id))
    return result.scalars().first()

# ---- AUDIT LOGS ----
async def get_logs_auditoria(db: AsyncSession, skip: int = 0, limit: int = 100, date_filter: str = None):
    query = select(models.LogAuditoria).options(
        selectinload(models.LogAuditoria.usuario_actor).selectinload(models.Usuario.rol),
        selectinload(models.LogAuditoria.usuario_actor).selectinload(models.Usuario.contacto)
    )
    if date_filter:
        query = query.filter(func.date(models.LogAuditoria.fecha_accion) == date_filter)

    total_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(total_query)
    total_count = total_result.scalar() or 0

    query = query.order_by(models.LogAuditoria.fecha_accion.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    items = result.scalars().all()
    
    return {"total": total_count, "items": items}

async def create_log(db: AsyncSession, log: schemas.LogAuditoriaCreate):
    db_log = models.LogAuditoria(**log.model_dump())
    db.add(db_log)
    await db.commit()
    await db.refresh(db_log)
    return db_log
