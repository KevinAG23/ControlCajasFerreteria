import os
from pathlib import Path
from dotenv import load_dotenv
from redis import Redis
from rq import Queue
from rq.worker import SimpleWorker

# Carga .env desde la raíz del proyecto (caja_api/.env)
ROOT = Path(__file__).resolve().parent
load_dotenv(dotenv_path=ROOT / ".env")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

class NoOpDeathPenalty:
    def __init__(self, *args, **kwargs): pass
    def __enter__(self): return self
    def __exit__(self, exc_type, exc, tb): return False

class WindowsWorker(SimpleWorker):
    death_penalty_class = NoOpDeathPenalty

if __name__ == "__main__":
    redis_conn = Redis.from_url(REDIS_URL)
    q = Queue("whisperx", connection=redis_conn)

    worker = WindowsWorker([q], connection=redis_conn)
    print(" Worker WHISPERX Windows-safe iniciado (sin SIGALRM)")
    worker.work(with_scheduler=False)
