import structlog

log = structlog.get_logger()


async def run_review_job(ctx: dict, repo: str, pr_number: int, review_id: str) -> None:
    import httpx
    from app.agents.orchestrator import run_all_agents
    from app.core.supabase_client import get_supabase_admin
    from app.services.github_service import get_pr

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

        mergeable_state = "unknown"
        try:
            pr = get_pr(repo, pr_number, wait_for_mergeable=True)
            mergeable_state = pr.get("mergeable_state") or "unknown"
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
        }).eq("id", review_id).execute()

        log.info("review_job_done", repo=repo, pr=pr_number, findings=len(findings))

    except Exception as exc:
        client.table("reviews").update({"status": "failed"}).eq("id", review_id).execute()
        log.error("review_job_failed", repo=repo, pr=pr_number, error=str(exc))
        raise
