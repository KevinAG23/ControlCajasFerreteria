# clean_queue.py
import os
import sys
from dotenv import load_dotenv
from redis import Redis
from rq import Queue
from rq.registry import StartedJobRegistry, FailedJobRegistry

load_dotenv()
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

print("=" * 60)
print("=== LIMPIEZA DE COLAS Y TRABAJOS REDIS ===")
print("=" * 60)

try:
    redis_conn = Redis.from_url(REDIS_URL)
    redis_conn.ping()
    print("[OK] Conexión a Redis exitosa.\n")
except Exception as e:
    print(f"[ERROR] Error al conectar a Redis: {e}")
    sys.exit(1)

queues = ["enhance", "whisperx", "analysis"]

# 1. Vaciar trabajos acumulados en la cola 'analysis'
q_analysis = Queue("analysis", connection=redis_conn)
total_analysis_queued = q_analysis.count
if total_analysis_queued > 0:
    q_analysis.empty()
    print(f"[OK] Cola 'analysis' vaciada con éxito. Se cancelaron {total_analysis_queued} trabajos pendientes.")
else:
    print("[OK] Cola 'analysis' ya estaba vacía.")

# 2. Limpiar registros de trabajos fallidos obsoletos (como archivos de meses pasados)
total_failed_cleaned = 0
for qname in queues:
    failed_reg = FailedJobRegistry(qname, connection=redis_conn)
    failed_ids = failed_reg.get_job_ids()
    if failed_ids:
        for jid in failed_ids:
            try:
                failed_reg.remove(jid, delete_job=True)
                total_failed_cleaned += 1
            except Exception:
                pass
        print(f"[OK] Se purgaron {len(failed_ids)} trabajos fallidos de la cola '{qname}'.")
    else:
        print(f"[OK] Cola '{qname}' no tiene trabajos fallidos.")

print(f"\n[TOTAL] {total_failed_cleaned} trabajos fallidos purgados en total.")

# 3. Mostrar estado final limpio
print("\n" + "=" * 60)
print(f"{'Cola (Queue)':<15} | {'En Cola (Queued)':<15} | {'Activos (Started)':<18}")
print("=" * 60)
for qname in queues:
    q = Queue(qname, connection=redis_conn)
    started = StartedJobRegistry(qname, connection=redis_conn)
    print(f"{qname:<15} | {q.count:<15} | {len(started.get_job_ids()):<18}")
print("=" * 60)
print("Listo. Las colas han sido saneadas.")
print("Ya no se enviarán análisis masivos innecesarios.")
print("=" * 60)
