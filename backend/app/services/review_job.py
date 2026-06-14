import asyncio

import httpx
import structlog

log = structlog.get_logger()

_DIFF_TRUNCATION_NOTICE = "\n\n[diff truncated — too large for analysis]"
_GH_API = "https://api.github.com"
_SEVERITY_ICON = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "🔵", "info": "⚪"}

_SLACK_COLORS = {"block": "#e01e5a", "review": "#f0a500", "approve": "#2eb886"}
_REC_EMOJI    = {"block": "⛔", "review": "⚠️", "approve": "✅"}


async def _post_slack(
    webhook_url: str,
    repo: str,
    pr_number: int,
    pr_title: str,
    risk_score: int,
    recommendation: str,
    findings: list,
    narrative: str,
) -> None:
    color = _SLACK_COLORS.get(recommendation, "#aaaaaa")
    fields = [
        {"type": "mrkdwn", "text": f"*Risk Score*\n{risk_score}/100"},
        {"type": "mrkdwn", "text": f"*Recommendation*\n{_REC_EMOJI.get(recommendation, '')} {recommendation.upper()}"},
        {"type": "mrkdwn", "text": f"*Critical*\n{sum(1 for f in findings if f.get('severity') == 'critical')}"},
        {"type": "mrkdwn", "text": f"*High*\n{sum(1 for f in findings if f.get('severity') == 'high')}"},
    ]
    payload = {
        "attachments": [{
            "color": color,
            "blocks": [
                {"type": "header", "text": {"type": "plain_text", "text": "🔍 PatchSense Review Complete"}},
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*<https://github.com/{repo}/pull/{pr_number}|{pr_title or f'PR #{pr_number}'}>*\n`{repo}`",
                    },
                    "accessory": {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "View PR"},
                        "url": f"https://github.com/{repo}/pull/{pr_number}",
                    },
                },
                {"type": "section", "fields": fields},
                {"type": "section", "text": {"type": "mrkdwn", "text": f"_{narrative}_"}},
            ],
        }]
    }
    async with httpx.AsyncClient() as client:
        await client.post(webhook_url, json=payload, timeout=10)


async def run_review_job(ctx: dict, repo: str, pr_number: int, review_id: str) -> None:
    from app.agents.orchestrator import run_all_agents
    from app.agents.summary_agent import run_summary_agent, compute_risk_score, compute_recommendation
    from app.core.config import settings
    from app.core.supabase_client import get_supabase_admin
    from app.services.github_service import get_pr, get_pr_files, post_commit_status, post_pr_review

    client = get_supabase_admin()
    log.info("review_job_started", repo=repo, pr=pr_number, review_id=review_id)

    # Prefer explicit PAT (dev/owner); fall back to GitHub App installation token
    # so every customer's repo is accessed with their own scoped credential.
    pat: str = ctx.get("github_pat") or settings.github_pat or ""
    if not pat:
        installation_id = ctx.get("installation_id")
        if installation_id:
            try:
                from app.core.installation_token import get_installation_token
                pat = get_installation_token(int(installation_id))
                log.info("using_installation_token", repo=repo, installation_id=installation_id)
            except Exception as exc:
                log.error("installation_token_failed", repo=repo, error=str(exc))

    diff_headers = {"Accept": "application/vnd.github.v3.diff"}
    api_headers = {"Accept": "application/vnd.github.v3+json", "X-GitHub-Api-Version": "2022-11-28"}
    if pat:
        diff_headers["Authorization"] = f"Bearer {pat}"
        api_headers["Authorization"] = f"Bearer {pat}"

    head_sha: str = ""
    try:
        row = client.table("reviews").select("head_sha").eq("id", review_id).maybe_single().execute()
        data = row.data if row is not None else None
        head_sha = str(data["head_sha"]) if isinstance(data, dict) and data.get("head_sha") else ""
    except Exception:
        pass

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
        async with httpx.AsyncClient(follow_redirects=True) as gh:
            diff_resp, meta_resp = await asyncio.gather(
                gh.get(f"{_GH_API}/repos/{repo}/pulls/{pr_number}", headers=diff_headers, timeout=30),
                gh.get(f"{_GH_API}/repos/{repo}", headers=api_headers, timeout=15),
            )
        diff_resp.raise_for_status()
        diff = diff_resp.text

        repo_language = ""
        if meta_resp.status_code == 200:
            meta = meta_resp.json()
            repo_language = meta.get("language") or ""
        repo_context = f"Primary language: {repo_language}" if repo_language else ""

        # Fetch custom rules for this repo and append to agent context.
        try:
            def _fetch_custom_rules() -> list[str]:
                repo_row = client.table("repos").select("id").eq("full_name", repo).maybe_single().execute()
                repo_data = repo_row.data if repo_row is not None else None
                if not isinstance(repo_data, dict):
                    return []
                rid = repo_data.get("id")
                if not rid:
                    return []
                rules_row = client.table("custom_rules").select("rule_text").eq("repo_id", rid).eq("enabled", True).execute()
                return [str(r["rule_text"]) for r in (rules_row.data or []) if isinstance(r, dict) and r.get("rule_text")]

            custom_rules = await asyncio.to_thread(_fetch_custom_rules)
            if custom_rules:
                rules_block = "\n\nTeam-defined rules (flag violations as high severity):\n" + "\n".join(f"- {r}" for r in custom_rules)
                repo_context += rules_block
                log.info("custom_rules_injected", repo=repo, count=len(custom_rules))
        except Exception as exc:
            log.warning("custom_rules_fetch_failed", repo=repo, error=str(exc))

        limit = settings.max_diff_chars
        if len(diff) > limit:
            diff = diff[:limit] + _DIFF_TRUNCATION_NOTICE
            log.warning("diff_truncated", repo=repo, pr=pr_number, chars=limit)

        mergeable_state = "unknown"
        conflict_files: list[str] = []
        base_branch = "main"
        try:
            pr_meta = await asyncio.to_thread(get_pr, repo, pr_number, True)
            mergeable_state = pr_meta.get("mergeable_state") or "unknown"
            base_branch = pr_meta.get("base", {}).get("ref", "main")
            if pr_meta.get("mergeable") is False:
                conflict_files = await asyncio.to_thread(get_pr_files, repo, pr_number)
        except Exception as exc:
            log.warning("mergeable_check_failed", repo=repo, pr=pr_number, error=str(exc))

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

        risk_score = compute_risk_score(findings)
        recommendation = compute_recommendation(risk_score, findings)
        narrative = await run_summary_agent(diff, findings)

        client.table("reviews").update({
            "status": "completed",
            "completed_at": "now()",
            "mergeable_state": mergeable_state,
            "base_branch": base_branch,
            "conflict_files": conflict_files or None,
            "summary": narrative or None,
            "risk_score": risk_score,
            "recommendation": recommendation,
        }).eq("id", review_id).execute()

        log.info("review_job_done", repo=repo, pr=pr_number, findings=len(findings), risk_score=risk_score)

        # Post inline GitHub PR review comments for all findings with line numbers.
        if findings and head_sha and pat:
            try:
                gh_comments = []
                for f in findings:
                    if not f.get("line_number") or not f.get("file_path"):
                        continue
                    icon = _SEVERITY_ICON.get(f.get("severity", "info"), "⚪")
                    body = f"{icon} **{f.get('severity','info').upper()}** `[{f.get('agent','review')}]`\n\n{f['message']}"
                    if f.get("suggestion"):
                        body += f"\n\n> 💡 **Suggestion:** {f['suggestion']}"
                    gh_comments.append({
                        "path": f["file_path"],
                        "line": f["line_number"],
                        "side": "RIGHT",
                        "body": body,
                    })
                if gh_comments:
                    review_body = f"**PatchSense** · Risk: {risk_score}/100 · {_REC_EMOJI.get(recommendation,'')} {recommendation.upper()}\n\n{narrative or ''}"
                    await post_pr_review(repo, pr_number, head_sha, gh_comments, review_body, token=pat)
                    log.info("pr_review_posted", repo=repo, pr=pr_number, comments=len(gh_comments))
            except Exception as exc:
                log.warning("pr_review_post_failed", repo=repo, pr=pr_number, error=str(exc))

        # Post Slack notification if webhook configured and risk is non-trivial.
        try:
            def _fetch_slack_meta():
                r = client.table("repos").select("slack_webhook_url").eq("full_name", repo).maybe_single().execute()
                t = client.table("reviews").select("pr_title").eq("id", review_id).maybe_single().execute()
                return r, t

            repo_row, pr_title_row = await asyncio.to_thread(_fetch_slack_meta)
            repo_data = repo_row.data if repo_row is not None else None
            pr_data = pr_title_row.data if pr_title_row is not None else None
            slack_url = str(repo_data["slack_webhook_url"]) if isinstance(repo_data, dict) and repo_data.get("slack_webhook_url") else None
            pr_title = str(pr_data["pr_title"]) if isinstance(pr_data, dict) and pr_data.get("pr_title") else f"PR #{pr_number}"

            if slack_url and (recommendation in ("block", "review") or risk_score >= 30):
                await _post_slack(slack_url, repo, pr_number, pr_title, risk_score, recommendation, findings, narrative or "")
        except Exception as exc:
            log.warning("slack_notification_failed", repo=repo, error=str(exc))

        # Post final commit status.
        if head_sha and pat:
            has_critical = any(f.get("severity") == "critical" for f in findings)
            if has_critical:
                critical_count = sum(1 for f in findings if f.get("severity") == "critical")
                await post_commit_status(
                    repo, head_sha, "failure",
                    f"PatchSense: {critical_count} critical issue(s) — risk {risk_score}/100",
                    token=pat,
                )
            else:
                desc = f"PatchSense: risk {risk_score}/100 — {len(findings)} issue(s)" if findings else "PatchSense: No issues found"
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
