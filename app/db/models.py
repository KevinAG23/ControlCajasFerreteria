import uuid
from datetime import datetime, time
from sqlalchemy import String, Boolean, Text, ForeignKey, DateTime, Time, JSON, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.orm import relationship
class Base(DeclarativeBase):
    pass

class Contacto(Base):
    __tablename__ = "contactos"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100))
    apellido: Mapped[str] = mapped_column(String(100))
    rol: Mapped[str | None] = mapped_column(String(50), nullable=True)

class Rol(Base):
    __tablename__ = "roles"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(50))

class Usuario(Base):
    __tablename__ = "usuarios"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    contacto_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contactos.id"))
    rol_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id"))
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    en_uso: Mapped[bool] = mapped_column(Boolean, default=False)

    contacto = relationship("Contacto", lazy="selectin")
    rol = relationship("Rol", lazy="selectin")


class Caja(Base):
    __tablename__ = "cajas"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    nombre_identificador: Mapped[str] = mapped_column(String(50), unique=True)
    ubicacion: Mapped[str | None] = mapped_column(String(100), nullable=True)
    activo: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    en_uso: Mapped[bool] = mapped_column(Boolean, default=False)
    estado_operativo: Mapped[str | None] = mapped_column(String(50), default="Operativa")
    estado_grabacion: Mapped[str | None] = mapped_column(String(50), default="apagado")
    ultima_conexion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    contacto_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contactos.id"), nullable=True)
    turno_manana_inicio: Mapped[time | None] = mapped_column(Time, nullable=True)
    turno_manana_fin: Mapped[time | None] = mapped_column(Time, nullable=True)
    turno_tarde_inicio: Mapped[time | None] = mapped_column(Time, nullable=True)
    turno_tarde_fin: Mapped[time | None] = mapped_column(Time, nullable=True)
    grabacion_habilitada: Mapped[bool] = mapped_column(Boolean, default=True)
    en_pausa: Mapped[bool] = mapped_column(Boolean, default=False)
    microfono_asignado: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lista_microfonos: Mapped[list | None] = mapped_column(JSON, nullable=True)
    duracion_segmento_minutos: Mapped[int] = mapped_column(Integer, default=10)
    version_actual: Mapped[str | None] = mapped_column(String(50), nullable=True)
