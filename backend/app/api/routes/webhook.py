from fastapi import APIRouter, BackgroundTasks, Request, Response, HTTPException

from app.core.hmac_verify import verify_webhook_signature
from app.core.config import settings
from app.core.supabase_client import get_supabase_admin
from app.schemas.webhook_event import parse_pr_event
from app.services.review_job import run_review_job

router = APIRouter()

REVIEW_TRIGGER_ACTIONS = {"opened", "synchronize", "reopened"}


@router.post("/webhook")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks) -> Response:
    body = await request.body()
    sig = request.headers.get("X-Hub-Signature-256", "")
    if not verify_webhook_signature(body, sig):
        raise HTTPException(status_code=401, detail="Invalid signature")
    payload = await request.json()
    event = parse_pr_event(payload)
    if event and event.action in REVIEW_TRIGGER_ACTIONS:
        client = get_supabase_admin()
        review = client.table("reviews").insert({
            "repo_full_name": event.repo_full_name,
            "pr_number": event.pr_number,
            "pr_title": event.pr_title,
            "status": "pending",
        }).execute().data[0]
        ctx = {"github_pat": settings.github_pat}
        background_tasks.add_task(
            run_review_job,
            ctx, event.repo_full_name, event.pr_number, review["id"],
        )
    return Response(status_code=200)
