import os
from dotenv import load_dotenv
from redis import Redis
from rq import Queue
from rq.worker import SimpleWorker, Worker

load_dotenv()
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

class NoOpDeathPenalty:
    def __init__(self, *args, **kwargs): pass
    def __enter__(self): return self
    def __exit__(self, exc_type, exc, tb): return False

if os.name == "nt":
    class WindowsWorker(SimpleWorker):
        death_penalty_class = NoOpDeathPenalty
    worker_class = WindowsWorker
    print(" Worker ANALYSIS Windows-safe (SimpleWorker) configurado")
else:
    worker_class = Worker
    print(" Worker ANALYSIS estándar (ForkWorker) configurado para Linux")

if __name__ == "__main__":
    redis_conn = Redis.from_url(REDIS_URL)
    q = Queue("analysis", connection=redis_conn)
    worker = worker_class([q], connection=redis_conn)
    print(" Worker ANALYSIS iniciado y escuchando...")
    worker.work(with_scheduler=False)
