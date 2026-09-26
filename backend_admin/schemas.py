from pydantic import BaseModel, confloat
from typing import Optional, List, Any, Dict
from datetime import datetime, time
from uuid import UUID
from decimal import Decimal

# ---- CONTACTOS ----
class ContactoBase(BaseModel):
    nombre: str
    apellido: str
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    rol: Optional[str] = None
    rol_especifico: Optional[str] = None
    sucursal_id: Optional[UUID] = None

class ContactoCreate(ContactoBase):
    pass

class ContactoUpdate(ContactoBase):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    rol: Optional[str] = None
    rol_especifico: Optional[str] = None
    sucursal_id: Optional[UUID] = None

class Contacto(ContactoBase):
    id: UUID
    fecha_creacion: Optional[datetime]
    fecha_actualizacion: Optional[datetime]
    creado_por_uid: Optional[UUID] = None
    actualizado_por_uid: Optional[UUID] = None

    class Config:
        from_attributes = True

# ---- ROLES ----
class RolBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None

class Rol(RolBase):
    id: UUID

    class Config:
        from_attributes = True

# ---- USUARIOS ----
class UsuarioBase(BaseModel):
    username: str
    activo: Optional[bool] = True
    en_uso: Optional[bool] = False
    rol_id: UUID
    contacto_id: UUID

class UsuarioCreate(UsuarioBase):
    password: str

class UsuarioUpdate(BaseModel):
    username: Optional[str] = None
    activo: Optional[bool] = None
    en_uso: Optional[bool] = None
    rol_id: Optional[UUID] = None
    contacto_id: Optional[UUID] = None
    password: Optional[str] = None

class Usuario(UsuarioBase):
    id: UUID
    fecha_creacion: Optional[datetime]
    rol: Optional[Rol] = None
    contacto: Optional[Contacto] = None

    class Config:
        from_attributes = True

# ---- CAJAS ----
class CajaBase(BaseModel):
    nombre_identificador: str
    ubicacion: Optional[str] = None
    activo: Optional[bool] = True
    en_uso: Optional[bool] = False
    estado_operativo: Optional[str] = "Operativa"
    estado_grabacion: Optional[str] = "apagado"
    motivo_estado: Optional[str] = None
    ultima_conexion: Optional[datetime] = None
    contacto_id: Optional[UUID] = None
    sucursal_id: Optional[UUID] = None
    turno_manana_inicio: Optional[time] = None
    turno_manana_fin: Optional[time] = None
    turno_tarde_inicio: Optional[time] = None
    turno_tarde_fin: Optional[time] = None
    grabacion_habilitada: Optional[bool] = True
    en_pausa: Optional[bool] = False
    microfono_asignado: Optional[str] = None
    lista_microfonos: Optional[List[str]] = []
    duracion_segmento_minutos: Optional[int] = 10
    version_actual: Optional[str] = None

class CajaCreate(CajaBase):
    pass

class CajaUpdate(BaseModel):
    nombre_identificador: Optional[str] = None
    ubicacion: Optional[str] = None
    activo: Optional[bool] = None
    en_uso: Optional[bool] = None
    estado_operativo: Optional[str] = None
    motivo_estado: Optional[str] = None
    ultima_conexion: Optional[datetime] = None
    contacto_id: Optional[UUID] = None
    sucursal_id: Optional[UUID] = None
    turno_manana_inicio: Optional[time] = None
    turno_manana_fin: Optional[time] = None
    turno_tarde_inicio: Optional[time] = None
    turno_tarde_fin: Optional[time] = None
    grabacion_habilitada: Optional[bool] = None
    en_pausa: Optional[bool] = None
    microfono_asignado: Optional[str] = None
    lista_microfonos: Optional[List[str]] = None
    duracion_segmento_minutos: Optional[int] = None
    version_actual: Optional[str] = None

class Caja(CajaBase):
    id: UUID
    contacto: Optional[Contacto] = None

    class Config:
        from_attributes = True

# ---- CATEGORIAS PREGUNTAS ----
class CategoriaPreguntaBase(BaseModel):
    nombre: str

class CategoriaPreguntaCreate(CategoriaPreguntaBase):
    pass

class CategoriaPreguntaUpdate(BaseModel):
    nombre: Optional[str] = None

class CategoriaPregunta(CategoriaPreguntaBase):
    id: UUID

    class Config:
        from_attributes = True

# ---- SUCURSALES ----
class SucursalBase(BaseModel):
    nombre: str
    direccion: Optional[str] = None
    activa: Optional[bool] = True

class SucursalCreate(SucursalBase):
    pass

class SucursalUpdate(BaseModel):
    nombre: Optional[str] = None
    direccion: Optional[str] = None
    activa: Optional[bool] = None

class Sucursal(SucursalBase):
    id: UUID
    fecha_creacion: Optional[datetime]

    class Config:
        from_attributes = True

# ---- CATALOGO PREGUNTAS ----
class CatalogoPreguntaBase(BaseModel):
    texto_pregunta: str
    categoria_id: UUID
    peso_puntaje: Optional[int] = 1
    activo: Optional[bool] = True
    tipo_respuesta: Optional[str] = "ESCALA_NUMERICA"
    configuracion_respuesta: Optional[Dict[str, Any]] = {}
    instruccion_ia: Optional[str] = None
    ejemplo_respuesta_esperada: Optional[str] = None

class CatalogoPreguntaCreate(CatalogoPreguntaBase):
    pass

class CatalogoPreguntaUpdate(BaseModel):
    texto_pregunta: Optional[str] = None
    categoria_id: Optional[UUID] = None
    peso_puntaje: Optional[int] = None
    activo: Optional[bool] = None
    tipo_respuesta: Optional[str] = None
    configuracion_respuesta: Optional[Dict[str, Any]] = None
    instruccion_ia: Optional[str] = None
    ejemplo_respuesta_esperada: Optional[str] = None

class CatalogoPregunta(CatalogoPreguntaBase):
    id: UUID
    categoria: Optional[CategoriaPregunta] = None

    class Config:
        from_attributes = True

# ---- ESTADO BUFFER CAJAS ----
class EstadoBufferCajaBase(BaseModel):
    estado_actual: Optional[str] = 'ESPERANDO_CLIENTE'
    buffer_segmentos_json: Optional[List[Dict[str, Any]]] = []
    ultimo_archivo_procesado: Optional[str] = None

class EstadoBufferCajaUpdate(EstadoBufferCajaBase):
    pass

class EstadoBufferCaja(EstadoBufferCajaBase):
    caja_id: UUID
    ultima_actualizacion: Optional[datetime]

    class Config:
        from_attributes = True

# ---- GRABACIONES ----
# Lightweight embedded analisis for use inside Grabacion list
class AnalisisResumen(BaseModel):
    id: UUID
    resumen_ejecutivo: Optional[str] = None
    sentimiento_general: Optional[str] = None
    calificacion_general: Optional[float] = None

    class Config:
        from_attributes = True

class GrabacionBase(BaseModel):
    usuario_id: Optional[UUID] = None
    contacto_id: Optional[UUID] = None
    caja_id: UUID
    fecha_hora_inicio: datetime
    fecha_hora_fin: Optional[datetime] = None
    duracion_segundos: Optional[int] = None
    nombre_archivo_origen: Optional[str] = None
    estado_proceso: Optional[str] = 'ANALIZADO'

class GrabacionCreate(GrabacionBase):
    pass

class GrabacionUpdate(BaseModel):
    fecha_hora_fin: Optional[datetime] = None
    duracion_segundos: Optional[int] = None
    estado_proceso: Optional[str] = None

class Grabacion(GrabacionBase):
    id: UUID
    created_at: Optional[datetime]
    usuario: Optional[Usuario] = None
    contacto: Optional[Contacto] = None
    caja: Optional[Caja] = None
    analisis: Optional[AnalisisResumen] = None

    class Config:
        from_attributes = True

# ---- SEGMENTOS TRANSCRIPCION ----
class SegmentoTranscripcionBase(BaseModel):
    inicio_segundo: float
    fin_segundo: float
    hablante: Optional[str] = None
    rol_inferido: Optional[str] = None
    texto: str
    orden: int

class SegmentoTranscripcionCreate(SegmentoTranscripcionBase):
    transcripcion_id: UUID

class SegmentoTranscripcion(SegmentoTranscripcionBase):
    id: UUID
    transcripcion_id: UUID

    class Config:
        from_attributes = True

# ---- TRANSCRIPCIONES ----
class TranscripcionBase(BaseModel):
    texto_completo: Optional[str] = None

class TranscripcionCreate(TranscripcionBase):
    grabacion_id: UUID

class Transcripcion(TranscripcionBase):
    id: UUID
    grabacion_id: UUID
    created_at: Optional[datetime]
    segmentos: List[SegmentoTranscripcion] = []

    class Config:
        from_attributes = True

# ---- RESPUESTAS EVALUACION ----
class RespuestaEvaluacionBase(BaseModel):
    pregunta_id: UUID
    segmento_evidencia_id: Optional[UUID] = None
    respuesta_booleana: Optional[bool] = None
    puntaje_obtenido: Optional[float] = None
    justificacion_ia: Optional[str] = None

class RespuestaEvaluacionUpdate(BaseModel):
    puntaje_obtenido: Optional[float] = None
    respuesta_booleana: Optional[bool] = None
    justificacion_ia: Optional[str] = None

class RespuestaEvaluacionCreate(RespuestaEvaluacionBase):
    analisis_id: UUID

class RespuestaEvaluacion(RespuestaEvaluacionBase):
    id: UUID
    analisis_id: UUID
    created_at: Optional[datetime]
    pregunta: Optional[CatalogoPregunta] = None

    class Config:
        from_attributes = True

# ---- ANALISIS GENERAL ----
class AnalisisGeneralBase(BaseModel):
    resumen_ejecutivo: Optional[str] = None
    sentimiento_general: Optional[str] = None
    calificacion_general: Optional[float] = None

class AnalisisGeneralUpdate(BaseModel):
    calificacion_general: Optional[float] = None

class AnalisisGeneralCreate(BaseModel):
    grabacion_id: Optional[UUID] = None
    atencion_id: Optional[UUID] = None

class AnalisisGeneral(AnalisisGeneralBase):
    id: UUID
    grabacion_id: Optional[UUID] = None
    atencion_id: Optional[UUID] = None
    fecha_analisis: Optional[datetime]
    respuestas: List[RespuestaEvaluacion] = []

    class Config:
        from_attributes = True

# ---- LOGS AUDITORIA ----
class LogAuditoriaBase(BaseModel):
    usuario_actor_id: Optional[UUID] = None
    tabla_afectada: str
    id_registro_afectado: UUID
    tipo_accion: str
    cambios_json: Optional[Dict[str, Any]] = None
    direccion_ip: Optional[str] = None

class LogAuditoriaCreate(LogAuditoriaBase):
    pass

class LogAuditoria(LogAuditoriaBase):
    id: UUID
    fecha_accion: Optional[datetime]
    usuario_actor: Optional[Usuario] = None

    class Config:
        from_attributes = True

class PaginatedLogs(BaseModel):
    total: int
    items: List[LogAuditoria]
