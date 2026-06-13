import structlog

log = structlog.get_logger()

_DIFF_TRUNCATION_NOTICE = "\n\n[diff truncated — too large for analysis]"


async def run_review_job(ctx: dict, repo: str, pr_number: int, review_id: str) -> None:
    import httpx
    from app.agents.orchestrator import run_all_agents
    from app.core.config import settings
    from app.core.supabase_client import get_supabase_admin
    from app.services.github_service import get_pr, get_pr_files

    client = get_supabase_admin()
    log.info("review_job_started", repo=repo, pr=pr_number, review_id=review_id)

    try:
        pat = ctx.get("github_pat")
        headers = {"Accept": "application/vnd.github.v3.diff"}
        if pat:
            headers["Authorization"] = f"Bearer {pat}"
        resp = httpx.get(
            f"https://api.github.com/repos/{repo}/pulls/{pr_number}",
            headers=headers, timeout=30, follow_redirects=True,
        )
        resp.raise_for_status()
        diff = resp.text

        # Cap diff size to avoid excessive AI token spend on massive PRs.
        limit = settings.max_diff_chars
        if len(diff) > limit:
            diff = diff[:limit] + _DIFF_TRUNCATION_NOTICE
            log.warning("diff_truncated", repo=repo, pr=pr_number, chars=limit)

        mergeable_state = "unknown"
        conflict_files: list[str] = []
        base_branch = "main"
        try:
            pr_meta = get_pr(repo, pr_number, wait_for_mergeable=True)
            mergeable_state = pr_meta.get("mergeable_state") or "unknown"
            base_branch = pr_meta.get("base", {}).get("ref", "main")
            if pr_meta.get("mergeable") is False:
                conflict_files = get_pr_files(repo, pr_number)
        except Exception as exc:
            log.warning("mergeable_check_failed", repo=repo, pr=pr_number, error=str(exc))

        findings = await run_all_agents(diff)

        if findings:
            rows = [
                {
                    "review_id": review_id,
                    "agent": f["agent"],
                    "severity": f["severity"],
                    "file_path": f["file_path"],
                    "line_number": f.get("line_number"),
                    "message": f["message"],
                    "suggestion": f.get("suggestion"),
                }
                for f in findings
            ]
            client.table("findings").insert(rows).execute()

        client.table("reviews").update({
            "status": "completed",
            "completed_at": "now()",
            "mergeable_state": mergeable_state,
            "base_branch": base_branch,
            "conflict_files": conflict_files or None,
        }).eq("id", review_id).execute()

        log.info("review_job_done", repo=repo, pr=pr_number, findings=len(findings))

    except Exception as exc:
        client.table("reviews").update({"status": "failed"}).eq("id", review_id).execute()
        log.error("review_job_failed", repo=repo, pr=pr_number, error=str(exc))
        raise
