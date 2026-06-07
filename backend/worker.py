from arq import run_worker
from arq.connections import RedisSettings

from app.core.config import settings
from app.services.review_job import run_review_job


# ARQ worker settings — registers all background job functions
class WorkerSettings:
    functions = [run_review_job]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)


if __name__ == "__main__":
    run_worker(WorkerSettings)
