# requeue_analysis.py
import os
import sys
from dotenv import load_dotenv
from redis import Redis
from rq import Queue
from rq.registry import FailedJobRegistry
from sqlalchemy import create_engine, text

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
DATABASE_URL = (os.getenv("DATABASE_URL_SYNC") or "").strip() or (os.getenv("DATABASE_URL") or "").strip()
if DATABASE_URL.startswith("postgresql+asyncpg://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)

print("=" * 60)
print("=== REPROCESADOR DE ANÁLISIS PENDIENTES Y FALLIDOS ===")
print("=" * 60)

try:
    redis_conn = Redis.from_url(REDIS_URL)
    redis_conn.ping()
    print("[OK] Conexión a Redis exitosa.\n")
except Exception as e:
    print(f"[ERROR] No se pudo conectar a Redis: {e}")
    sys.exit(1)

q_analysis = Queue("analysis", connection=redis_conn)

# 1. Reintentar trabajos fallidos en la cola 'analysis' de RQ
failed_registry = FailedJobRegistry("analysis", connection=redis_conn)
failed_ids = failed_registry.get_job_ids()
print(f"[*] Trabajos en registro de fallidos de cola 'analysis': {len(failed_ids)}")
requeued_count = 0
for jid in failed_ids:
    try:
        failed_registry.requeue(jid)
        requeued_count += 1
    except Exception as e:
        print(f"    - No se pudo reenviar {jid}: {e}")
print(f"[OK] {requeued_count} trabajos reencolados desde FailedJobRegistry.\n")

# 2. Conectar a PostgreSQL para sanear duplicados y buscar atenciones sin análisis
if DATABASE_URL:
    try:
        engine = create_engine(DATABASE_URL, pool_pre_ping=True)
        with engine.connect() as conn:
            # 2.1 Limpiar atenciones duplicadas exactas (mismo grabacion_id, misma hora inicio, misma duracion)
            # Conservamos la que tenga análisis, o la más antigua si ninguna tiene
            dup_del_query = text("""
                DELETE FROM public.atenciones a
                USING public.atenciones b
                WHERE a.id > b.id
                  AND a.grabacion_id = b.grabacion_id
                  AND a.fecha_hora_inicio = b.fecha_hora_inicio
                  AND a.duracion_segundos = b.duracion_segundos
                  AND NOT EXISTS (SELECT 1 FROM public.analisis_general ag WHERE ag.atencion_id = a.id)
            """)
            del_result = conn.execute(dup_del_query)
            conn.commit()
            print(f"[OK] {del_result.rowcount} atenciones duplicadas limpiadas de la base de datos.")

            # 2.2 Buscar TODAS las atenciones que no tienen registro en analisis_general
            rows = conn.execute(text("""
                SELECT a.id::text, a.grabacion_id::text, a.estado
                FROM public.atenciones a
                LEFT JOIN public.analisis_general ag ON a.id = ag.atencion_id
                WHERE ag.id IS NULL
                ORDER BY a.created_at ASC
            """)).fetchall()
            
            print(f"[*] Atenciones totales sin análisis en BD: {len(rows)}")
            enqueued_atenciones = 0
            for r in rows:
                aten_id = r[0]
                job_id = f"evaluate_{aten_id}"
                job = q_analysis.fetch_job(job_id)
                if not job or job.is_failed or job.is_canceled:
                    q_analysis.enqueue(
                        "rq_workers.llm_worker.evaluate_atencion_job",
                        aten_id,
                        job_id=job_id,
                        result_ttl=3600,
                        ttl=3600,
                        job_timeout=600,
                    )
                    enqueued_atenciones += 1
            print(f"[OK] {enqueued_atenciones} evaluaciones de atenciones encoladas correctamente.\n")
            
            # 2.3 Buscar grabaciones con transcripción pendientes de extracción
            grab_rows = conn.execute(text("""
                SELECT g.id::text
                FROM public.grabaciones g
                JOIN public.transcripciones t ON g.id = t.grabacion_id
                WHERE g.estado_proceso IN ('FAILED_EXTRACT', 'FAILED', 'ANALYZING', 'EXTRACTING')
                   OR NOT EXISTS (SELECT 1 FROM public.atenciones WHERE grabacion_id = g.id)
            """)).fetchall()
            
            print(f"[*] Grabaciones con transcripción pendientes de extracción: {len(grab_rows)}")
            enqueued_grab = 0
            for gr in grab_rows:
                gid = gr[0]
                conn.execute(text("UPDATE public.grabaciones SET estado_proceso='TRANSCRITO' WHERE id=CAST(:id AS uuid)"), {"id": gid})
                job_id = f"analysis_{gid}"
                q_analysis.enqueue(
                    "rq_workers.llm_worker.extract_atenciones_job",
                    gid,
                    job_id=job_id,
                    result_ttl=3600,
                    ttl=3600,
                    job_timeout=600,
                )
                enqueued_grab += 1
            conn.commit()
            print(f"[OK] {enqueued_grab} extracciones de grabaciones encoladas correctamente.\n")
    except Exception as db_err:
        print(f"[WARN] Error al conectar o consultar la base de datos: {db_err}\n")

print("=" * 60)
print("=== PROCESO COMPLETADO ===")
print("Los workers de 'worker_analysis' procesarán los trabajos pendientes con la nueva versión.")
print("Puedes monitorear el avance ejecutando:")
print("  python monitor_queues.py")
print("=" * 60)
