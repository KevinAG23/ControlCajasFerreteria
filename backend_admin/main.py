from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from datetime import timedelta
from typing import List, Optional
from uuid import UUID
import logging

import models
import database
import auth
import schemas
import crud

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(content=b"", media_type="image/x-icon")

@app.on_event("startup")
async def startup_event():
    from sqlalchemy import text, func
    import models
    try:
        async with database.engine.begin() as conn:
            # Create any missing tables (like atenciones)
            await conn.run_sync(models.Base.metadata.create_all)
            
            # Alter tables for new columns
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS estado_operativo VARCHAR(50) DEFAULT 'Operativa';"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS motivo_estado TEXT;"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES sucursales(id);"))
            await conn.execute(text("ALTER TABLE contactos ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES sucursales(id);"))
            await conn.execute(text("ALTER TABLE contactos ADD COLUMN IF NOT EXISTS rol_especifico VARCHAR(50);"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS estado_grabacion VARCHAR(50) DEFAULT 'apagado';"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS turno_manana_inicio TIME DEFAULT '07:30:00';"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS turno_manana_fin TIME DEFAULT '12:30:00';"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS turno_tarde_inicio TIME DEFAULT '13:30:00';"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS turno_tarde_fin TIME DEFAULT '18:00:00';"))
            await conn.execute(text("ALTER TABLE categorias_preguntas ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS grabacion_habilitada BOOLEAN DEFAULT TRUE;"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS en_pausa BOOLEAN DEFAULT FALSE;"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS microfono_asignado VARCHAR(255);"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS lista_microfonos JSONB DEFAULT '[]'::jsonb;"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS duracion_segmento_minutos INTEGER DEFAULT 10;"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS version_actual VARCHAR(50);"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS lista_microfonos JSONB DEFAULT '[]'::jsonb;"))
            await conn.execute(text("ALTER TABLE contactos ADD COLUMN IF NOT EXISTS sucursal_id UUID;"))
            await conn.execute(text("ALTER TABLE contactos ADD COLUMN IF NOT EXISTS rol_especifico VARCHAR(100);"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS sucursal_id UUID;"))
            await conn.execute(text("ALTER TABLE catalogo_preguntas ADD COLUMN IF NOT EXISTS ejemplo_respuesta_esperada TEXT;"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS duracion_segmento_minutos INTEGER DEFAULT 10;"))
            await conn.execute(text("ALTER TABLE contactos ADD COLUMN IF NOT EXISTS rol VARCHAR(50);"))
            await conn.execute(text("ALTER TABLE grabaciones ALTER COLUMN usuario_id DROP NOT NULL;"))
            await conn.execute(text("ALTER TABLE atenciones ALTER COLUMN usuario_id DROP NOT NULL;"))
            await conn.execute(text("ALTER TABLE grabaciones ADD COLUMN IF NOT EXISTS contacto_id UUID REFERENCES contactos(id) ON DELETE SET NULL;"))
            await conn.execute(text("ALTER TABLE atenciones ADD COLUMN IF NOT EXISTS contacto_id UUID REFERENCES contactos(id) ON DELETE SET NULL;"))
            await conn.execute(text("ALTER TABLE analisis_general ALTER COLUMN grabacion_id DROP NOT NULL;"))
            await conn.execute(text("ALTER TABLE analisis_general ADD COLUMN IF NOT EXISTS atencion_id UUID REFERENCES atenciones(id) ON DELETE CASCADE;"))
            await conn.execute(text("ALTER TABLE atenciones ADD COLUMN IF NOT EXISTS grabacion_id UUID REFERENCES grabaciones(id) ON DELETE CASCADE;"))
            print("Database migrations applied successfully on startup.")
    except Exception as e:
        print(f"Failed to apply database migration on startup: {e}")

    try:
        async with database.SessionLocal() as db:
            # 1. Retroactive Link of Atenciones to Grabaciones
            link_query = """
            UPDATE public.atenciones a
            SET grabacion_id = g.id
            FROM public.grabaciones g
            WHERE a.grabacion_id IS NULL
              AND a.caja_id = g.caja_id
              AND a.fecha_hora_inicio >= g.fecha_hora_inicio
              AND (g.fecha_hora_fin IS NULL OR a.fecha_hora_inicio <= g.fecha_hora_fin);
            """
            res = await db.execute(text(link_query))
            await db.commit()
            print(f"Retroactive atenciones-grabaciones link applied. Rows affected: {res.rowcount if hasattr(res, 'rowcount') else 'unknown'}")
    except Exception as e:
        print(f"Failed to apply startup data migrations/syncs: {e}")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/token", response_model=dict)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.Usuario).where(models.Usuario.username == form_data.username))
    user = result.scalars().first()
    
    if not user or not auth.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username, "rol": str(user.rol_id)},
        expires_delta=access_token_expires
    )
    
    role_result = await db.execute(select(models.Rol).where(models.Rol.id == user.rol_id))
    role = role_result.scalars().first()
    role_name = role.nombre if role else "Unknown"

    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "user": {
            "username": user.username,
            "role": role_name,
            "id": str(user.id)
        }
    }

# --- CONTACTS ENDPOINTS ---
@app.get("/contactos", response_model=List[schemas.Contacto])
async def read_contactos(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    return await crud.get_contactos(db, skip=skip, limit=limit)

@app.post("/contactos", response_model=schemas.Contacto)
async def create_contacto(contacto: schemas.ContactoCreate, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    db_contacto = await crud.create_contacto(db=db, contacto=contacto, user_id=current_user.id)
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="contactos",
        id_registro_afectado=db_contacto.id,
        tipo_accion="INSERT",
        cambios_json=contacto.model_dump(mode='json')
    ))
    return db_contacto

@app.put("/contactos/{contacto_id}", response_model=schemas.Contacto)
async def update_contacto(contacto_id: UUID, contacto: schemas.ContactoUpdate, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    db_contacto = await crud.update_contacto(db=db, contacto_id=contacto_id, contacto=contacto, user_id=current_user.id)
    if db_contacto is None:
        raise HTTPException(status_code=404, detail="Contacto not found")
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="contactos",
        id_registro_afectado=contacto_id,
        tipo_accion="UPDATE",
        cambios_json=contacto.model_dump(mode='json', exclude_unset=True)
    ))
    return db_contacto

@app.delete("/contactos/{contacto_id}")
async def delete_contacto(contacto_id: UUID, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    await crud.delete_contacto(db=db, contacto_id=contacto_id)
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="contactos",
        id_registro_afectado=contacto_id,
        tipo_accion="DELETE"
    ))
    return {"ok": True}

# --- SUCURSALES ENDPOINTS ---
@app.get("/sucursales", response_model=List[schemas.Sucursal])
async def read_sucursales(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    return await crud.get_sucursales(db, skip=skip, limit=limit)

@app.post("/sucursales", response_model=schemas.Sucursal)
async def create_sucursal(sucursal: schemas.SucursalCreate, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    db_sucursal = await crud.create_sucursal(db=db, sucursal=sucursal)
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="sucursales",
        id_registro_afectado=db_sucursal.id,
        tipo_accion="INSERT",
        cambios_json=sucursal.model_dump(mode='json')
    ))
    return db_sucursal

@app.put("/sucursales/{sucursal_id}", response_model=schemas.Sucursal)
async def update_sucursal(sucursal_id: UUID, sucursal: schemas.SucursalUpdate, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    db_sucursal = await crud.update_sucursal(db=db, sucursal_id=sucursal_id, sucursal=sucursal)
    if not db_sucursal:
        raise HTTPException(status_code=404, detail="Sucursal not found")
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="sucursales",
        id_registro_afectado=sucursal_id,
        tipo_accion="UPDATE",
        cambios_json=sucursal.model_dump(mode='json', exclude_unset=True)
    ))
    return db_sucursal

@app.delete("/sucursales/{sucursal_id}")
async def delete_sucursal(sucursal_id: UUID, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    try:
        success = await crud.delete_sucursal(db=db, sucursal_id=sucursal_id)
        if not success:
            raise HTTPException(status_code=404, detail="Sucursal not found")
        await crud.create_log(db, schemas.LogAuditoriaCreate(
            usuario_actor_id=current_user.id,
            tabla_afectada="sucursales",
            id_registro_afectado=sucursal_id,
            tipo_accion="DELETE"
        ))
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- USERS ENDPOINTS ---
@app.get("/usuarios", response_model=List[schemas.Usuario])
async def read_usuarios(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    return await crud.get_usuarios(db, skip=skip, limit=limit)

@app.post("/usuarios", response_model=schemas.Usuario)
async def create_usuario(usuario: schemas.UsuarioCreate, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    result = await db.execute(select(models.Usuario).where(models.Usuario.username == usuario.username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # Enforce role matching contact role if contact has a role
    contact_result = await db.execute(select(models.Contacto).where(models.Contacto.id == usuario.contacto_id))
    db_contact = contact_result.scalars().first()
    if db_contact and db_contact.rol:
        role_result = await db.execute(select(models.Rol).where(models.Rol.nombre.ilike(db_contact.rol)))
        db_role = role_result.scalars().first()
        if db_role:
            usuario.rol_id = db_role.id

    db_user = await crud.create_usuario(db=db, usuario=usuario, creator_id=current_user.id)
    safe_data = usuario.model_dump(mode='json')
    if "password" in safe_data:
        del safe_data["password"]
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="usuarios",
        id_registro_afectado=db_user.id,
        tipo_accion="INSERT",
        cambios_json=safe_data
    ))
    return db_user

@app.put("/usuarios/{usuario_id}", response_model=schemas.Usuario)
async def update_usuario(usuario_id: UUID, usuario: schemas.UsuarioUpdate, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    db_usuario = await crud.update_usuario(db=db, usuario_id=usuario_id, usuario=usuario, editor_id=current_user.id)
    if db_usuario is None:
        raise HTTPException(status_code=404, detail="Usuario not found")
    safe_data = usuario.model_dump(mode='json', exclude_unset=True)
    if "password" in safe_data:
        del safe_data["password"]
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="usuarios",
        id_registro_afectado=usuario_id,
        tipo_accion="UPDATE",
        cambios_json=safe_data
    ))
    return db_usuario

@app.delete("/usuarios/{usuario_id}")
async def delete_usuario(usuario_id: UUID, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    await crud.delete_usuario(db=db, usuario_id=usuario_id)
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="usuarios",
        id_registro_afectado=usuario_id,
        tipo_accion="DELETE"
    ))
    return {"ok": True}

@app.get("/roles", response_model=List[schemas.Rol])
async def read_roles(db: AsyncSession = Depends(database.get_db)):
    # Allow fetching roles even without auth if needed for registration form, else protect it
    result = await db.execute(select(models.Rol))
    return result.scalars().all()

# --- CAJAS ENDPOINTS ---
@app.get("/cajas", response_model=List[schemas.Caja])
async def read_cajas(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    return await crud.get_cajas(db, skip=skip, limit=limit)

@app.post("/cajas", response_model=schemas.Caja)
async def create_caja(caja: schemas.CajaCreate, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    result = await db.execute(select(models.Caja).where(models.Caja.nombre_identificador == caja.nombre_identificador))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Caja name already exists")
    db_caja = await crud.create_caja(db=db, caja=caja)
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="cajas",
        id_registro_afectado=db_caja.id,
        tipo_accion="INSERT",
        cambios_json=caja.model_dump(mode='json')
    ))
    return db_caja

@app.put("/cajas/{caja_id}", response_model=schemas.Caja)
async def update_caja(caja_id: UUID, caja: schemas.CajaUpdate, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    db_caja = await crud.update_caja(db=db, caja_id=caja_id, caja=caja)
    if db_caja is None:
        raise HTTPException(status_code=404, detail="Caja not found")
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="cajas",
        id_registro_afectado=caja_id,
        tipo_accion="UPDATE",
        cambios_json=caja.model_dump(mode='json', exclude_unset=True)
    ))
    return db_caja

@app.delete("/cajas/{caja_id}")
async def delete_caja(caja_id: UUID, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    await crud.delete_caja(db=db, caja_id=caja_id)
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="cajas",
        id_registro_afectado=caja_id,
        tipo_accion="DELETE"
    ))
    return {"ok": True}

# --- METRIC CATEGORIES ENDPOINTS (Backwards compatible naming) ---
@app.get("/metricas/categorias", response_model=List[schemas.CategoriaPregunta])
async def read_categorias_metricas(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    return await crud.get_categorias_preguntas(db, skip=skip, limit=limit)

@app.post("/metricas/categorias", response_model=schemas.CategoriaPregunta)
async def create_categoria_metrica(categoria: schemas.CategoriaPreguntaCreate, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    result = await db.execute(select(models.CategoriaPregunta).where(models.CategoriaPregunta.nombre == categoria.nombre))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Category name already exists")
    db_categoria = await crud.create_categoria_pregunta(db=db, categoria=categoria)
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="categorias_preguntas",
        id_registro_afectado=db_categoria.id,
        tipo_accion="INSERT",
        cambios_json=categoria.model_dump(mode='json')
    ))
    return db_categoria

@app.put("/metricas/categorias/{categoria_id}", response_model=schemas.CategoriaPregunta)
async def update_categoria_metrica(categoria_id: UUID, categoria: schemas.CategoriaPreguntaUpdate, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    db_categoria = await crud.update_categoria_pregunta(db=db, categoria_id=categoria_id, categoria=categoria)
    if db_categoria is None:
        raise HTTPException(status_code=404, detail="Category not found")
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="categorias_preguntas",
        id_registro_afectado=categoria_id,
        tipo_accion="UPDATE",
        cambios_json=categoria.model_dump(mode='json', exclude_unset=True)
    ))
    return db_categoria

@app.delete("/metricas/categorias/{categoria_id}")
async def delete_categoria_metrica(categoria_id: UUID, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    await crud.delete_categoria_pregunta(db=db, categoria_id=categoria_id)
        
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="categorias_preguntas",
        id_registro_afectado=categoria_id,
        tipo_accion="DELETE"
    ))
    return {"ok": True}

# --- METRIC QUESTIONS ENDPOINTS ---
@app.get("/metricas/preguntas", response_model=List[schemas.CatalogoPregunta])
async def read_preguntas_metricas(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    return await crud.get_catalogo_preguntas(db, skip=skip, limit=limit)

@app.post("/metricas/preguntas", response_model=schemas.CatalogoPregunta)
async def create_pregunta_metrica(pregunta: schemas.CatalogoPreguntaCreate, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    db_pregunta = await crud.create_catalogo_pregunta(db=db, pregunta=pregunta)
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="catalogo_preguntas",
        id_registro_afectado=db_pregunta.id,
        tipo_accion="INSERT",
        cambios_json=pregunta.model_dump(mode='json')
    ))
    return db_pregunta

@app.put("/metricas/preguntas/{pregunta_id}", response_model=schemas.CatalogoPregunta)
async def update_pregunta_metrica(pregunta_id: UUID, pregunta: schemas.CatalogoPreguntaUpdate, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    db_pregunta = await crud.update_catalogo_pregunta(db=db, pregunta_id=pregunta_id, pregunta=pregunta)
    if db_pregunta is None:
        raise HTTPException(status_code=404, detail="Question not found")
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="catalogo_preguntas",
        id_registro_afectado=pregunta_id,
        tipo_accion="UPDATE",
        cambios_json=pregunta.model_dump(mode='json', exclude_unset=True)
    ))
    return db_pregunta

@app.delete("/metricas/preguntas/{pregunta_id}")
async def delete_pregunta_metrica(pregunta_id: UUID, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    await crud.delete_catalogo_pregunta(db=db, pregunta_id=pregunta_id)
    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="catalogo_preguntas",
        id_registro_afectado=pregunta_id,
        tipo_accion="DELETE"
    ))
    return {"ok": True}

# --- SESSIONS / STATE ENDPOINTS ---
@app.post("/sesiones/abrir")
async def abrir_sesion(data: dict, db: AsyncSession = Depends(database.get_db)):
    # Basic mockup for now to satisfy frontend requests until full logic is implemented
    username = data.get("username")
    caja_code = data.get("caja_code")
    logger.info(f"Opening session for {username} at {caja_code}")

    result = await db.execute(select(models.Caja).where(models.Caja.nombre_identificador == caja_code))
    caja = result.scalars().first()
    if not caja:
        raise HTTPException(status_code=404, detail="Caja not found")
        
    return {"ok": True, "message": "Sesión abierta exitosamente"}

@app.post("/sesiones/cerrar")
async def cerrar_sesion(data: dict, db: AsyncSession = Depends(database.get_db)):
    # Basic mockup
    return {"ok": True, "message": "Sesión cerrada exitosamente"}

@app.get("/admin/estado-cajas")
async def estado_cajas(db: AsyncSession = Depends(database.get_db)):
    cajas = await crud.get_cajas(db, skip=0, limit=100)
    
    # We simulate the state matching frontend expectations
    # The frontend expects: [{ codigo: "Caja01", tiene_sesion_abierta: true/false }]
    result = []
    for c in cajas:
        # Check buffer table if there's any active state
        estado_buf = await crud.get_buffer_caja(db, c.id)
        is_active = False
        if estado_buf and estado_buf.estado_actual != 'ESPERANDO_CLIENTE':
            is_active = True
            
        result.append({
            "codigo": c.nombre_identificador,
            "tiene_sesion_abierta": is_active
        })
    return result

@app.get("/admin/cost-report")
async def api_cost_report():
    import json
    import os
    costos_file = "/app/storage/costos.jsonl"
    report = []
    if os.path.exists(costos_file):
        with open(costos_file, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    try:
                        report.append(json.loads(line.strip()))
                    except:
                        pass
    return report

# --- GRABACIONES / ANALISIS ENDPOINTS ---
@app.get("/grabaciones", response_model=List[schemas.Grabacion])
async def api_get_grabaciones(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(database.get_db)):
    return await crud.get_grabaciones(db, skip=skip, limit=limit)
    
@app.get("/grabaciones/caja/{caja_id}", response_model=List[schemas.Grabacion])
async def api_get_grabaciones_caja(caja_id: UUID, limit: int = 100, db: AsyncSession = Depends(database.get_db)):
    return await crud.get_grabaciones_by_caja(db, caja_id, limit=limit)

@app.get("/grabaciones/usuario/{usuario_id}", response_model=List[schemas.Grabacion])
async def api_get_grabaciones_usuario(usuario_id: UUID, limit: int = 100, db: AsyncSession = Depends(database.get_db)):
    return await crud.get_grabaciones_by_usuario(db, usuario_id, limit=limit)

@app.get("/analisis", response_model=List[schemas.AnalisisGeneral])
async def api_get_analisis(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(database.get_db)):
    # We fetch analyses
    return await crud.get_analisis(db)

@app.get("/analisis/{grabacion_id}", response_model=schemas.AnalisisGeneral)
async def api_get_analisis_by_grabacion(grabacion_id: UUID, db: AsyncSession = Depends(database.get_db)):
    analyses = await crud.get_analisis(db, grabacion_id=grabacion_id)
    if not analyses:
        raise HTTPException(status_code=404, detail="Analysis not found")
        
    if len(analyses) == 1:
        return analyses[0]
        
    # Merge multiple analyses
    combined_resumen = ""
    total_calif = 0
    valid_calif_count = 0
    combined_respuestas = []
    sentiments = []
    
    # Put the general summary first
    analyses_sorted = sorted(analyses, key=lambda x: 0 if x.atencion_id is None else 1)
    
    aten_counter = 1
    for a in analyses_sorted:
        is_general = (a.atencion_id is None)
        
        # Build combined summary
        if is_general:
            combined_resumen += "=== RESUMEN GENERAL DE LA GRABACIÓN ===\n"
        else:
            combined_resumen += f"=== ATENCIÓN {aten_counter} ===\n"
            
        if a.resumen_ejecutivo:
            combined_resumen += f"{a.resumen_ejecutivo}\n"
        combined_resumen += "\n"
        
        # Calculate average qualification
        if a.calificacion_general is not None:
            total_calif += float(a.calificacion_general)
            valid_calif_count += 1
            
        if a.sentimiento_general:
            sentiments.append(a.sentimiento_general.upper())
            
        # Merge responses
        if not is_general:
            for resp in (a.respuestas or []):
                resp_dict = {
                    "id": resp.id,
                    "analisis_id": a.id,
                    "pregunta_id": resp.pregunta_id,
                    "segmento_evidencia_id": resp.segmento_evidencia_id,
                    "respuesta_booleana": resp.respuesta_booleana,
                    "puntaje_obtenido": resp.puntaje_obtenido,
                    "justificacion_ia": f"[Atención {aten_counter}] {resp.justificacion_ia or ''}",
                    "created_at": resp.created_at,
                    "pregunta": {
                        "id": resp.pregunta.id,
                        "texto_pregunta": resp.pregunta.texto_pregunta,
                        "categoria_id": resp.pregunta.categoria_id,
                        "peso_puntaje": resp.pregunta.peso_puntaje,
                        "activo": resp.pregunta.activo,
                        "tipo_respuesta": resp.pregunta.tipo_respuesta,
                        "configuracion_respuesta": resp.pregunta.configuracion_respuesta,
                        "instruccion_ia": resp.pregunta.instruccion_ia,
                        "categoria": {
                            "id": resp.pregunta.categoria.id,
                            "nombre": resp.pregunta.categoria.nombre
                        } if resp.pregunta.categoria else None
                    } if resp.pregunta else None
                }
                combined_respuestas.append(resp_dict)
            aten_counter += 1
            
    # Determine sentiment
    final_sentiment = "NEUTRO"
    if "NEGATIVO" in sentiments:
        final_sentiment = "NEGATIVO"
    elif "POSITIVO" in sentiments:
        final_sentiment = "POSITIVO"
        
    avg_calif = total_calif / valid_calif_count if valid_calif_count > 0 else 0
    
    return {
        "id": grabacion_id,
        "grabacion_id": grabacion_id,
        "atencion_id": None,
        "resumen_ejecutivo": combined_resumen.strip(),
        "sentimiento_general": final_sentiment,
        "calificacion_general": avg_calif,
        "fecha_analisis": analyses[0].fecha_analisis if analyses else None,
        "respuestas": combined_respuestas
    }

@app.put("/analisis/{analisis_id}", response_model=schemas.AnalisisGeneral)
async def api_update_analisis(analisis_id: UUID, analisis_update: schemas.AnalisisGeneralUpdate, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    db_analisis = await crud.update_analisis(db=db, analisis_id=analisis_id, analisis_update=analisis_update)
    if not db_analisis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    # We serialize the change with current_user
    safe_data = analisis_update.model_dump(exclude_unset=True)
    if safe_data.get("calificacion_general"):
        safe_data["calificacion_general"] = str(safe_data["calificacion_general"])

    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="analisis_general",
        id_registro_afectado=analisis_id,
        tipo_accion="UPDATE",
        cambios_json=safe_data
    ))
    return db_analisis

@app.put("/analisis/respuestas/{respuesta_id}", response_model=schemas.RespuestaEvaluacion)
async def api_update_respuesta(respuesta_id: UUID, respuesta_update: schemas.RespuestaEvaluacionUpdate, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    db_respuesta = await crud.update_respuesta(db=db, respuesta_id=respuesta_id, respuesta_update=respuesta_update)
    if not db_respuesta:
        raise HTTPException(status_code=404, detail="Response not found")
    
    safe_data = respuesta_update.model_dump(exclude_unset=True)
    if safe_data.get("puntaje_obtenido"):
        safe_data["puntaje_obtenido"] = str(safe_data["puntaje_obtenido"])

    await crud.create_log(db, schemas.LogAuditoriaCreate(
        usuario_actor_id=current_user.id,
        tabla_afectada="respuestas_evaluacion",
        id_registro_afectado=respuesta_id,
        tipo_accion="UPDATE",
        cambios_json=safe_data
    ))
    return db_respuesta

@app.get("/transcripciones/{grabacion_id}", response_model=List[schemas.Transcripcion])
async def api_get_transcripciones(grabacion_id: UUID, db: AsyncSession = Depends(database.get_db)):
    return await crud.get_transcripciones(db, grabacion_id)

@app.get("/logs", response_model=schemas.PaginatedLogs)
async def api_get_logs(skip: int = 0, limit: int = 100, date_filter: Optional[str] = None, db: AsyncSession = Depends(database.get_db), current_user: models.Usuario = Depends(auth.get_current_active_user)):
    return await crud.get_logs_auditoria(db, skip=skip, limit=limit, date_filter=date_filter)
