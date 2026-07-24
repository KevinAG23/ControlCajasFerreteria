# run_worker_enhance.py (Windows-safe para RQ 2.1.x)
import os
from dotenv import load_dotenv
from redis import Redis
from rq import Queue
from rq.worker import SimpleWorker

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


class WindowsWorker(SimpleWorker):
    #  clave: reemplaza la clase de timeout por una no-op
    death_penalty_class = NoOpDeathPenalty


if __name__ == "__main__":
    redis_conn = Redis.from_url(REDIS_URL)
    q = Queue("enhance", connection=redis_conn)

    worker = WindowsWorker([q], connection=redis_conn)
    print("Worker ENHANCE Windows-safe iniciado (sin SIGALRM)")
    worker.work(with_scheduler=False)
