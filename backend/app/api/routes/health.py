from fastapi import APIRouter

router = APIRouter()


# Returns service liveness status
@router.get("/health")
def get_health() -> dict:
    return {"status": "ok", "service": "patchsense-prguard"}
