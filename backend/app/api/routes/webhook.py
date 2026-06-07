from fastapi import APIRouter, Request, Response

router = APIRouter()


# Placeholder — implemented in feature/webhook-receiver
@router.post("/webhook")
async def receive_webhook(request: Request) -> Response:
    return Response(status_code=200)
