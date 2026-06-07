from arq.connections import RedisSettings, ArqRedis

from app.core.config import settings

REDIS_SETTINGS = RedisSettings.from_dsn(settings.redis_url)


# Enqueues a review job with installation and PR context
async def enqueue_review(redis: ArqRedis, installation_id: int, repo: str, pr_number: int) -> None:
    await redis.enqueue_job("run_review_job", installation_id, repo, pr_number)
