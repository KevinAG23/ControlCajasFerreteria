# monitor_queues.py
import os
import sys
from dotenv import load_dotenv
from redis import Redis
from rq import Queue
from rq.registry import StartedJobRegistry, FailedJobRegistry

load_dotenv()
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

print(f"Conectando a Redis en: {REDIS_URL}\n")
try:
    redis_conn = Redis.from_url(REDIS_URL)
    redis_conn.ping()
    print("[OK] Conexión a Redis exitosa.\n")
except Exception as e:
    print(f"[ERROR] Error al conectar a Redis: {e}")
    sys.exit(1)

queues = ["enhance", "whisperx", "analysis"]
print("=" * 60)
print(f"{'Cola (Queue)':<15} | {'En Cola (Queued)':<15} | {'Activos (Started)':<18}")
print("=" * 60)

for qname in queues:
    q = Queue(qname, connection=redis_conn)
    started = StartedJobRegistry(qname, connection=redis_conn)
    print(f"{qname:<15} | {q.count:<15} | {len(started.get_job_ids()):<18}")

print("=" * 60)

print("\n--- DETALLES DE TRABAJOS FALLIDOS ---")
total_failed = 0
for qname in queues:
    q = Queue(qname, connection=redis_conn)
    failed_registry = FailedJobRegistry(qname, connection=redis_conn)
    failed_ids = failed_registry.get_job_ids()
    total_failed += len(failed_ids)
    
    if failed_ids:
        print(f"\n[!] Cola '{qname}' tiene {len(failed_ids)} trabajos fallidos:")
        for job_id in failed_ids[:5]:  # Mostrar los primeros 5
            job = q.fetch_job(job_id)
            if job:
                print(f"  * Job ID: {job.id}")
                print(f"    Función: {job.func_name}")
                print(f"    Creado: {job.created_at}")
                if job.exc_info:
                    last_lines = [line.strip() for line in job.exc_info.strip().splitlines() if line.strip()]
                    err_msg = last_lines[-1] if last_lines else "Desconocido"
                    print(f"    Error: {err_msg}")
                else:
                    print("    Error: Desconocido (sin traceback)")
                print()
        if len(failed_ids) > 5:
            print(f"  ... y {len(failed_ids) - 5} trabajos fallidos más en esta cola.")
    else:
        print(f" [OK] Cola '{qname}': 0 trabajos fallidos.")

print("\nTips de Diagnóstico:")
print("1. Si hay muchos trabajos en cola ('En Cola') y 0 activos, revisa si el contenedor del worker correspondiente está corriendo.")
print("   Comando: docker compose ps")
print("2. Si los trabajos se mueven a fallidos, revisa los logs del worker para ver el error completo.")
print("   Comando: docker compose logs -f worker_whisperx")
print("   Comando: docker compose logs -f worker_analysis")
