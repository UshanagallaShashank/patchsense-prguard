import asyncio

from arq import run_worker

from app.core.config import settings

# ARQ worker entrypoint — implemented in feature/queue-worker
WorkerSettings = type(
    "WorkerSettings",
    (),
    {"functions": [], "redis_settings": {"host": settings.redis_url}},
)

if __name__ == "__main__":
    asyncio.run(run_worker(WorkerSettings))
