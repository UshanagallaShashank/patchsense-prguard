import asyncio

import httpx
import structlog

log = structlog.get_logger()

_DIFF_TRUNCATION_NOTICE = "\n\n[diff truncated — too large for analysis]"
_GH_API = "https://api.github.com"


async def run_review_job(ctx: dict, repo: str, pr_number: int, review_id: str) -> None:
    from app.agents.orchestrator import run_all_agents
    from app.core.config import settings
    from app.core.supabase_client import get_supabase_admin
    from app.services.github_service import get_pr, get_pr_files, post_commit_status

    client = get_supabase_admin()
    log.info("review_job_started", repo=repo, pr=pr_number, review_id=review_id)

    pat = ctx.get("github_pat") or settings.github_pat
    diff_headers = {"Accept": "application/vnd.github.v3.diff"}
    api_headers = {"Accept": "application/vnd.github.v3+json", "X-GitHub-Api-Version": "2022-11-28"}
    if pat:
        diff_headers["Authorization"] = f"Bearer {pat}"
        api_headers["Authorization"] = f"Bearer {pat}"

    head_sha: str = ""
    try:
        # Retrieve head_sha from DB (stored by webhook before job is enqueued).
        row = client.table("reviews").select("head_sha").eq("id", review_id).maybe_single().execute()
        data = row.data if row is not None else None
        head_sha = str(data["head_sha"]) if isinstance(data, dict) and data.get("head_sha") else ""
    except Exception:
        pass

    # Signal GitHub that review is in progress so PR shows a pending check.
    if head_sha and pat:
        try:
            await post_commit_status(
                repo, head_sha, "pending",
                "PatchSense is analysing this PR…",
                token=pat,
            )
        except Exception as exc:
            log.warning("commit_status_pending_failed", repo=repo, error=str(exc))

    try:
        # Fetch diff and repo metadata concurrently using async httpx.
        async with httpx.AsyncClient(follow_redirects=True) as gh:
            diff_resp, meta_resp = await asyncio.gather(
                gh.get(f"{_GH_API}/repos/{repo}/pulls/{pr_number}", headers=diff_headers, timeout=30),
                gh.get(f"{_GH_API}/repos/{repo}", headers=api_headers, timeout=15),
            )
        diff_resp.raise_for_status()
        diff = diff_resp.text

        # Build a short repo context string to improve agent accuracy.
        repo_language = ""
        if meta_resp.status_code == 200:
            meta = meta_resp.json()
            repo_language = meta.get("language") or ""
        repo_context = f"Primary language: {repo_language}" if repo_language else ""

        limit = settings.max_diff_chars
        if len(diff) > limit:
            diff = diff[:limit] + _DIFF_TRUNCATION_NOTICE
            log.warning("diff_truncated", repo=repo, pr=pr_number, chars=limit)

        mergeable_state = "unknown"
        conflict_files: list[str] = []
        base_branch = "main"
        try:
            # Run sync GitHub calls in thread pool to avoid blocking the loop.
            pr_meta = await asyncio.to_thread(get_pr, repo, pr_number, True)
            mergeable_state = pr_meta.get("mergeable_state") or "unknown"
            base_branch = pr_meta.get("base", {}).get("ref", "main")
            if pr_meta.get("mergeable") is False:
                conflict_files = await asyncio.to_thread(get_pr_files, repo, pr_number)
        except Exception as exc:
            log.warning("mergeable_check_failed", repo=repo, pr=pr_number, error=str(exc))

        # Enforce per-review timeout so a hung Gemini call doesn't stall forever.
        findings = await asyncio.wait_for(
            run_all_agents(diff, repo_context),
            timeout=settings.review_timeout_seconds,
        )

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
                    "confidence": f.get("confidence"),
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

        # Post final commit status: failure if any critical finding, else success.
        if head_sha and pat:
            has_critical = any(f.get("severity") == "critical" for f in findings)
            if has_critical:
                critical_count = sum(1 for f in findings if f.get("severity") == "critical")
                await post_commit_status(
                    repo, head_sha, "failure",
                    f"PatchSense: {critical_count} critical issue(s) found — review before merging",
                    token=pat,
                )
            else:
                total = len(findings)
                desc = f"PatchSense: {total} issue(s) found — no critical findings" if total else "PatchSense: No issues found"
                await post_commit_status(repo, head_sha, "success", desc, token=pat)

    except asyncio.TimeoutError:
        client.table("reviews").update({"status": "failed"}).eq("id", review_id).execute()
        log.error("review_job_timeout", repo=repo, pr=pr_number, timeout=settings.review_timeout_seconds)
        if head_sha and pat:
            try:
                await post_commit_status(repo, head_sha, "error", "PatchSense: Review timed out", token=pat)
            except Exception:
                pass
    except Exception as exc:
        client.table("reviews").update({"status": "failed"}).eq("id", review_id).execute()
        log.error("review_job_failed", repo=repo, pr=pr_number, error=str(exc))
        if head_sha and pat:
            try:
                await post_commit_status(repo, head_sha, "error", "PatchSense: Review failed", token=pat)
            except Exception:
                pass
        raise
