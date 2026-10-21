import os
from pathlib import Path
from dotenv import load_dotenv
from redis import Redis
from rq import Queue
from rq.worker import SimpleWorker, Worker

# Carga .env desde la raíz del proyecto (caja_api/.env)
ROOT = Path(__file__).resolve().parent
load_dotenv(dotenv_path=ROOT / ".env")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

class NoOpDeathPenalty:
    def __init__(self, *args, **kwargs): pass
    def __enter__(self): return self
    def __exit__(self, exc_type, exc, tb): return False

if os.name == "nt":
    class WindowsWorker(SimpleWorker):
        death_penalty_class = NoOpDeathPenalty
    worker_class = WindowsWorker
    print(" Worker WHISPERX Windows-safe (SimpleWorker) configurado")
else:
    worker_class = Worker
    print(" Worker WHISPERX estándar (ForkWorker) configurado para Linux")

if __name__ == "__main__":
    redis_conn = Redis.from_url(REDIS_URL)
    q = Queue("whisperx", connection=redis_conn)

    worker = worker_class([q], connection=redis_conn)
    print(" Worker WHISPERX iniciado y escuchando (MAX_JOBS=1)...")
    worker.work(with_scheduler=False, max_jobs=1)
