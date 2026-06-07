from fastapi import APIRouter, Request, Response, HTTPException

from app.core.hmac_verify import verify_webhook_signature
from app.schemas.webhook_event import parse_pr_event

router = APIRouter()

REVIEW_TRIGGER_ACTIONS = {"opened", "synchronize", "reopened"}


# Receives GitHub webhook, verifies signature, enqueues review job
@router.post("/webhook")
async def receive_webhook(request: Request) -> Response:
    body = await request.body()
    sig = request.headers.get("X-Hub-Signature-256", "")
    if not verify_webhook_signature(body, sig):
        raise HTTPException(status_code=401, detail="Invalid signature")
    payload = await request.json()
    event = parse_pr_event(payload)
    if event and event.action in REVIEW_TRIGGER_ACTIONS:
        pass  # queue.enqueue_review(event) — wired in feature/queue-worker
    return Response(status_code=200)
