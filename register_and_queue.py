# register_and_queue.py
import os
import sys
import uuid
import psycopg2
from datetime import datetime, timezone
from pathlib import Path
from redis import Redis
from rq import Queue
from dotenv import load_dotenv

load_dotenv()

# Valid Defaults
DEFAULT_USER_ID = "94a71e5c-2361-4d83-b6aa-1952378cba35"
DEFAULT_CONTACT_ID = "ad30c3db-4ac9-46d3-96a1-929290650d62"
DEFAULT_CAJA_ID = "1c1209fa-c8d4-4550-b8f4-5e0e8c69f96f"

DB_URL = os.getenv("DATABASE_URL_SYNC") or os.getenv("DATABASE_URL")
if DB_URL and DB_URL.startswith("postgresql+asyncpg://"):
    DB_URL = DB_URL.replace("postgresql+asyncpg://", "postgresql://", 1)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")


def register_and_queue(grabacion_id_str: str, yyyymmdd: str):
    grabacion_id_str = grabacion_id_str.strip().lower()
    
    # 1. Verificar existencia física
    storage_root = Path(os.getenv("STORAGE_ROOT", "storage")).resolve()
    incoming_path = storage_root / "incoming" / yyyymmdd / f"{grabacion_id_str}.wav"
    
    if not incoming_path.exists():
        print(f"ERROR: No se encontró el archivo de audio físico en {incoming_path}")
        return
        
    print(f"Archivo de audio encontrado: {incoming_path} ({incoming_path.stat().st_size / (1024*1024):.2f} MB)")
    
    # 2. Registrar en base de datos
    print(f"Conectando a base de datos...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    
    try:
        with conn.cursor() as cur:
            # Verificar si existe
            cur.execute("SELECT id FROM public.grabaciones WHERE id = %s", (grabacion_id_str,))
            row = cur.fetchone()
            
            if row:
                print(f"La grabación {grabacion_id_str} ya existe en la base de datos. Se reseteará su estado.")
                # Limpiar cualquier resto de tablas hijas para reprocesar de forma limpia
                cur.execute("DELETE FROM public.respuestas_evaluacion WHERE analisis_id IN (SELECT id FROM public.analisis_general WHERE grabacion_id = %s)", (grabacion_id_str,))
                cur.execute("DELETE FROM public.analisis_general WHERE grabacion_id = %s", (grabacion_id_str,))
                cur.execute("DELETE FROM public.atenciones WHERE grabacion_id = %s", (grabacion_id_str,))
                cur.execute("DELETE FROM public.segmentos_transcripcion WHERE transcripcion_id IN (SELECT id FROM public.transcripciones WHERE grabacion_id = %s)", (grabacion_id_str,))
                cur.execute("DELETE FROM public.transcripciones WHERE grabacion_id = %s", (grabacion_id_str,))
                
                cur.execute(
                    "UPDATE public.grabaciones SET estado_proceso = 'ENHANCE_QUEUED' WHERE id = %s",
                    (grabacion_id_str,)
                )
            else:
                print(f"Registrando nueva grabación {grabacion_id_str} en la base de datos...")
                dt_now = datetime.now(timezone.utc)
                cur.execute(
                    """
                    INSERT INTO public.grabaciones
                    (id, usuario_id, contacto_id, caja_id, fecha_hora_inicio, duracion_segundos,
                     nombre_archivo_origen, estado_proceso, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        grabacion_id_str,
                        DEFAULT_USER_ID,
                        DEFAULT_CONTACT_ID,
                        DEFAULT_CAJA_ID,
                        dt_now,
                        600,  # Estimación por defecto
                        f"{grabacion_id_str}.wav",
                        "ENHANCE_QUEUED",
                        dt_now
                    )
                )
                print("✓ Registro insertado.")
    finally:
        conn.close()
        
    # 3. Encolar en Redis
    print("Conectando a Redis y encolando en RQ...")
    redis_conn = Redis.from_url(REDIS_URL)
    q_whisperx = Queue("whisperx", connection=redis_conn)
    
    q_whisperx.enqueue(
        "whisperx_worker.whisperx_worker.transcribe_job",
        grabacion_id_str,
        yyyymmdd,
        job_id=f"whisperx_{grabacion_id_str}",
        result_ttl=3600,
        ttl=3600,
        failure_ttl=86400,
        job_timeout=1800,  # 30 min
    )
    print(f"✓ Éxito: Grabación {grabacion_id_str} encolada en la cola de RQ 'whisperx'.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python register_and_queue.py <grabacion_id> <yyyymmdd>")
        print("Ejemplo: python register_and_queue.py ff9dfb48-317e-4af8-aa57-e0dc2eb0da62 20260720")
    else:
        register_and_queue(sys.argv[1], sys.argv[2])
