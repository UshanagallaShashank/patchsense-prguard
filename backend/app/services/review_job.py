import structlog

log = structlog.get_logger()


# ARQ job handler: fetches diff, runs agents, posts comments
async def run_review_job(ctx: dict, installation_id: int, repo: str, pr_number: int) -> None:
    log.info("review_job_started", repo=repo, pr=pr_number)
    # orchestrator.run(installation_id, repo, pr_number) — wired in feature/agent-*
    log.info("review_job_done", repo=repo, pr=pr_number)
