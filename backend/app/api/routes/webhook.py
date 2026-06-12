from typing import Any, cast

from fastapi import APIRouter, BackgroundTasks, Request, Response, HTTPException

from app.core.hmac_verify import verify_webhook_signature
from app.core.config import settings
from app.core.supabase_client import get_supabase_admin
from app.schemas.webhook_event import parse_pr_event
from app.services.review_job import run_review_job

router = APIRouter()

_REVIEW_ACTIONS = {"opened", "synchronize", "reopened", "ready_for_review"}
_METADATA_ACTIONS = {"edited"}


@router.post("/webhook")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks) -> Response:
    body = await request.body()
    sig = request.headers.get("X-Hub-Signature-256", "")
    if not verify_webhook_signature(body, sig):
        raise HTTPException(status_code=401, detail="Invalid signature")

    event_type = request.headers.get("X-GitHub-Event", "")
    if event_type == "ping":
        return Response(status_code=200)
    if event_type and event_type != "pull_request":
        return Response(status_code=200)

    payload = await request.json()
    event = parse_pr_event(payload)
    if not event:
        return Response(status_code=200)

    # Ignore draft PRs unless they are being promoted to ready
    if event.is_draft and event.action != "ready_for_review":
        return Response(status_code=200)

    client = get_supabase_admin()

    if event.action == "closed":
        _update_latest_review(client, event.repo_full_name, event.pr_number, {"pr_state": event.pr_state})
        return Response(status_code=200)

    if event.action in _METADATA_ACTIONS:
        _update_latest_review(client, event.repo_full_name, event.pr_number, {"pr_title": event.pr_title})
        return Response(status_code=200)

    if event.action in _REVIEW_ACTIONS:
        review_id = _upsert_review(client, event)
        if review_id is None:
            return Response(status_code=200)
        ctx = {"github_pat": settings.github_pat}
        background_tasks.add_task(run_review_job, ctx, event.repo_full_name, event.pr_number, review_id)
        return Response(status_code=202)

    return Response(status_code=200)


def _latest_review(client: Any, repo: str, pr_number: int) -> dict[str, Any] | None:
    result = (
        client.table("reviews")
        .select("id, status")
        .eq("repo_full_name", repo)
        .eq("pr_number", pr_number)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        return cast(dict[str, Any], result.data[0])
    return None


def _update_latest_review(client: Any, repo: str, pr_number: int, patch: dict[str, Any]) -> None:
    existing = _latest_review(client, repo, pr_number)
    if existing:
        client.table("reviews").update(patch).eq("id", str(existing["id"])).execute()


def _upsert_review(client: Any, event: Any) -> str | None:
    existing = _latest_review(client, event.repo_full_name, event.pr_number)

    # Dedup guard: skip if already pending/running
    if existing and existing.get("status") in {"pending", "running"}:
        return None

    meta = {
        "pr_title": event.pr_title,
        "pr_branch": event.pr_branch,
        "author_login": event.author_login,
    }

    if existing:
        # Reset existing record for a re-review
        client.table("findings").delete().eq("review_id", str(existing["id"])).execute()
        client.table("reviews").update({
            **meta,
            "status": "pending",
            "pr_state": "open",
            "completed_at": None,
        }).eq("id", str(existing["id"])).execute()
        return str(existing["id"])

    # No record yet — create fresh
    row = cast(dict[str, Any], client.table("reviews").insert({
        "repo_full_name": event.repo_full_name,
        "pr_number": event.pr_number,
        **meta,
        "pr_state": "open",
        "status": "pending",
    }).execute().data[0])
    return str(row["id"])
