# run_worker_enhance.py (Windows-safe para RQ 2.1.x)
import os
from dotenv import load_dotenv
from redis import Redis
from rq import Queue
from rq.worker import SimpleWorker, Worker

load_dotenv()
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


class NoOpDeathPenalty:
    """Context manager que NO aplica SIGALRM (Windows-safe)."""
    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False  # no suprime excepciones


if os.name == "nt":
    class WindowsWorker(SimpleWorker):
        death_penalty_class = NoOpDeathPenalty
    worker_class = WindowsWorker
    print("Worker ENHANCE Windows-safe (SimpleWorker) configurado")
else:
    worker_class = Worker
    print("Worker ENHANCE estándar (ForkWorker) configurado para Linux")


if __name__ == "__main__":
    redis_conn = Redis.from_url(REDIS_URL)
    q = Queue("enhance", connection=redis_conn)

    worker = worker_class([q], connection=redis_conn)
    print("Worker ENHANCE iniciado y escuchando...")
    worker.work(with_scheduler=False)
