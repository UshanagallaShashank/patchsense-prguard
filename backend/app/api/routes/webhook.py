from typing import Any, cast

from fastapi import APIRouter, BackgroundTasks, Request, Response, HTTPException

from app.core.hmac_verify import verify_webhook_signature
from app.core.config import settings
from app.core.supabase_client import get_supabase_admin
from app.schemas.webhook_event import parse_pr_event
from app.services.review_job import run_review_job

router = APIRouter()


@router.post("/webhook")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks) -> Response:
    body = await request.body()
    sig = request.headers.get("X-Hub-Signature-256", "")
    if not verify_webhook_signature(body, sig):
        raise HTTPException(status_code=401, detail="Invalid signature")
    payload = await request.json()
    event = parse_pr_event(payload)
    if not event:
        return Response(status_code=200)

    client = get_supabase_admin()

    if event.action == "closed":
        # Mark the review for this PR as merged or closed
        client.table("reviews").update({
            "pr_state": event.pr_state,
        }).eq("repo_full_name", event.repo_full_name).eq("pr_number", event.pr_number).execute()

    elif event.action == "opened":
        # First time this PR is opened — create a fresh review record
        review = cast(dict[str, Any], client.table("reviews").insert({
            "repo_full_name": event.repo_full_name,
            "pr_number": event.pr_number,
            "pr_title": event.pr_title,
            "pr_state": "open",
            "status": "pending",
        }).execute().data[0])
        _enqueue(background_tasks, client, event, str(review["id"]))

    elif event.action in {"synchronize", "reopened"}:
        # New commits pushed — reuse the existing review record, clear old findings
        existing = (
            client.table("reviews")
            .select("id")
            .eq("repo_full_name", event.repo_full_name)
            .eq("pr_number", event.pr_number)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if existing:
            review_id: str = str(cast(dict[str, Any], existing[0])["id"])
            # Clear stale findings and reset status
            client.table("findings").delete().eq("review_id", review_id).execute()
            client.table("reviews").update({
                "status": "pending",
                "pr_title": event.pr_title,
                "pr_state": "open",
                "completed_at": None,
            }).eq("id", review_id).execute()
        else:
            # No prior record (e.g. webhook missed the open event) — create one
            review_id = str(cast(dict[str, Any], client.table("reviews").insert({
                "repo_full_name": event.repo_full_name,
                "pr_number": event.pr_number,
                "pr_title": event.pr_title,
                "pr_state": "open",
                "status": "pending",
            }).execute().data[0])["id"])

        ctx = {"github_pat": settings.github_pat}
        background_tasks.add_task(
            run_review_job, ctx, event.repo_full_name, event.pr_number, review_id,
        )

    return Response(status_code=200)


def _enqueue(background_tasks: BackgroundTasks, _client, event, review_id: str) -> None:
    ctx = {"github_pat": settings.github_pat}
    background_tasks.add_task(
        run_review_job, ctx, event.repo_full_name, event.pr_number, review_id,
    )
