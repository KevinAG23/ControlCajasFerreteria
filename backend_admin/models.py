import uuid
from sqlalchemy import (
    Column, String, Boolean, ForeignKey, DateTime, Text, Integer, JSON, DECIMAL, Numeric, Time
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Rol(Base):
    __tablename__ = "roles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre = Column(String(50), unique=True, nullable=False)
    descripcion = Column(Text)

    usuarios = relationship("Usuario", back_populates="rol")

class Contacto(Base):
    __tablename__ = "contactos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre = Column(String(100), nullable=False)
    apellido = Column(String(100), nullable=False)
    telefono = Column(String(20))
    email = Column(String(100))
    direccion = Column(Text)
    rol = Column(String(50), nullable=True)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())
    fecha_actualizacion = Column(DateTime(timezone=True), onupdate=func.now())
    creado_por_uid = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", use_alter=True, name="fk_contacto_creado_por"), nullable=True)
    actualizado_por_uid = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", use_alter=True, name="fk_contacto_actualizado_por"), nullable=True)

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contacto_id = Column(UUID(as_uuid=True), ForeignKey("contactos.id"), nullable=False)
    rol_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    activo = Column(Boolean, default=True)
    en_uso = Column(Boolean, default=False)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())
    creado_por_uid = Column(UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True)
    actualizado_por_uid = Column(UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True)

    rol = relationship("Rol", back_populates="usuarios")
    contacto = relationship("Contacto", foreign_keys=[contacto_id])
    grabaciones = relationship("Grabacion", back_populates="usuario")

class Caja(Base):
    __tablename__ = "cajas"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre_identificador = Column(String(50), unique=True, nullable=False)
    ubicacion = Column(String(100))
    activo = Column(Boolean, default=True)
    en_uso = Column(Boolean, default=False)
    estado_operativo = Column(String(50), default="Operativa")
    estado_grabacion = Column(String(50), default="apagado")
    motivo_estado = Column(Text, nullable=True)
    ultima_conexion = Column(DateTime(timezone=True), nullable=True)
    contacto_id = Column(UUID(as_uuid=True), ForeignKey("contactos.id"), nullable=True)
    turno_manana_inicio = Column(Time, nullable=True)
    turno_manana_fin = Column(Time, nullable=True)
    turno_tarde_inicio = Column(Time, nullable=True)
    turno_tarde_fin = Column(Time, nullable=True)
    grabacion_habilitada = Column(Boolean, default=True)
    en_pausa = Column(Boolean, default=False)

    contacto = relationship("Contacto")
    estado_buffer = relationship("EstadoBufferCaja", back_populates="caja", uselist=False)
    grabaciones = relationship("Grabacion", back_populates="caja")

class CategoriaPregunta(Base):
    __tablename__ = "categorias_preguntas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre = Column(String(50), unique=True, nullable=False)
    
    preguntas = relationship("CatalogoPreguntas", back_populates="categoria", cascade="all, delete-orphan")

class CatalogoPreguntas(Base):
    __tablename__ = "catalogo_preguntas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    categoria_id = Column(UUID(as_uuid=True), ForeignKey("categorias_preguntas.id"), nullable=False)
    texto_pregunta = Column(Text, nullable=False)
    peso_puntaje = Column(Integer, default=1)
    activo = Column(Boolean, default=True)
    
    # Nuevas variables dinámicas para el sistema de LLM
    tipo_respuesta = Column(String(50), default="ESCALA_NUMERICA")
    configuracion_respuesta = Column(JSONB, default={})
    instruccion_ia = Column(Text)

    categoria = relationship("CategoriaPregunta", back_populates="preguntas")

class EstadoBufferCaja(Base):
    __tablename__ = "estado_buffer_cajas"
    
    caja_id = Column(UUID(as_uuid=True), ForeignKey("cajas.id"), primary_key=True)
    estado_actual = Column(String(20), default='ESPERANDO_CLIENTE')
    buffer_segmentos_json = Column(JSONB, default=[])
    ultima_actualizacion = Column(DateTime(timezone=True), server_default=func.now())
    ultimo_archivo_procesado = Column(String(255))
    
    caja = relationship("Caja", back_populates="estado_buffer")

class Grabacion(Base):
    __tablename__ = "grabaciones"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True)
    contacto_id = Column(UUID(as_uuid=True), ForeignKey("contactos.id"), nullable=True)
    caja_id = Column(UUID(as_uuid=True), ForeignKey("cajas.id"), nullable=False)
    fecha_hora_inicio = Column(DateTime(timezone=True), nullable=False)
    fecha_hora_fin = Column(DateTime(timezone=True))
    duracion_segundos = Column(Integer)
    nombre_archivo_origen = Column(Text)
    estado_proceso = Column(String(20), default='ANALIZADO')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    usuario = relationship("Usuario", back_populates="grabaciones")
    contacto = relationship("Contacto")
    caja = relationship("Caja", back_populates="grabaciones")
    analisis = relationship("AnalisisGeneral", back_populates="grabacion", uselist=False, cascade="all, delete-orphan")
    transcripcion = relationship("Transcripcion", back_populates="grabacion", uselist=False, cascade="all, delete-orphan")

class Transcripcion(Base):
    __tablename__ = "transcripciones"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    grabacion_id = Column(UUID(as_uuid=True), ForeignKey("grabaciones.id", ondelete="CASCADE"), nullable=False)
    texto_completo = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    grabacion = relationship("Grabacion", back_populates="transcripcion")
    segmentos = relationship("SegmentoTranscripcion", back_populates="transcripcion", order_by="SegmentoTranscripcion.orden", cascade="all, delete-orphan")

class SegmentoTranscripcion(Base):
    __tablename__ = "segmentos_transcripcion"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transcripcion_id = Column(UUID(as_uuid=True), ForeignKey("transcripciones.id", ondelete="CASCADE"), nullable=False)
    inicio_segundo = Column(Numeric(10, 2), nullable=False)
    fin_segundo = Column(Numeric(10, 2), nullable=False)
    hablante = Column(String(50))
    rol_inferido = Column(String(20))
    texto = Column(Text, nullable=False)
    orden = Column(Integer, nullable=False)
    
    transcripcion = relationship("Transcripcion", back_populates="segmentos")

class Atencion(Base):
    __tablename__ = "atenciones"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=True)
    contacto_id = Column(UUID(as_uuid=True), ForeignKey("contactos.id"), nullable=True)
    caja_id = Column(UUID(as_uuid=True), ForeignKey("cajas.id"), nullable=False)
    grabacion_id = Column(UUID(as_uuid=True), ForeignKey("grabaciones.id", ondelete="CASCADE"), nullable=True)
    fecha_hora_inicio = Column(DateTime(timezone=True), nullable=False)
    fecha_hora_fin = Column(DateTime(timezone=True))
    duracion_segundos = Column(Integer)
    texto_transcripcion = Column(Text)
    estado = Column(String(20), default='EN_PROCESO') # EN_PROCESO, COMPLETADA
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    caja = relationship("Caja")
    usuario = relationship("Usuario")
    contacto = relationship("Contacto")
    analisis = relationship("AnalisisGeneral", back_populates="atencion", cascade="all, delete-orphan", uselist=False)


class AnalisisGeneral(Base):
    __tablename__ = "analisis_general"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    grabacion_id = Column(UUID(as_uuid=True), ForeignKey("grabaciones.id", ondelete="CASCADE"), nullable=True) # Retained for old data
    atencion_id = Column(UUID(as_uuid=True), ForeignKey("atenciones.id", ondelete="CASCADE"), nullable=True)
    resumen_ejecutivo = Column(Text)
    sentimiento_general = Column(String(20))
    calificacion_general = Column(Numeric(5, 2))
    fecha_analisis = Column(DateTime(timezone=True), server_default=func.now())
    
    grabacion = relationship("Grabacion", back_populates="analisis")
    atencion = relationship("Atencion", back_populates="analisis")
    respuestas = relationship("RespuestaEvaluacion", back_populates="analisis", cascade="all, delete-orphan")

class RespuestaEvaluacion(Base):
    __tablename__ = "respuestas_evaluacion"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analisis_id = Column(UUID(as_uuid=True), ForeignKey("analisis_general.id", ondelete="CASCADE"), nullable=False)
    pregunta_id = Column(UUID(as_uuid=True), ForeignKey("catalogo_preguntas.id"), nullable=False)
    segmento_evidencia_id = Column(UUID(as_uuid=True), ForeignKey("segmentos_transcripcion.id"))
    respuesta_booleana = Column(Boolean)
    puntaje_obtenido = Column(Numeric(4, 2))
    justificacion_ia = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    analisis = relationship("AnalisisGeneral", back_populates="respuestas")
    pregunta = relationship("CatalogoPreguntas")
    evidencia = relationship("SegmentoTranscripcion")

class LogAuditoria(Base):
    __tablename__ = "logs_auditoria"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_actor_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id"))
    tabla_afectada = Column(String(50), nullable=False)
    id_registro_afectado = Column(UUID(as_uuid=True), nullable=False)
    tipo_accion = Column(String(10), nullable=False)
    cambios_json = Column(JSONB)
    fecha_accion = Column(DateTime(timezone=True), server_default=func.now())
    direccion_ip = Column(String(45))
    
    usuario_actor = relationship("Usuario")
