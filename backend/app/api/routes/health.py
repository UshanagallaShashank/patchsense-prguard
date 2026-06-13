from fastapi import APIRouter
from app.core.supabase_client import get_supabase_admin

router = APIRouter()


@router.get("/health")
def get_health() -> dict:
    try:
        get_supabase_admin().table("reviews").select("id").limit(1).execute()
        db = "ok"
    except Exception:
        db = "error"
    return {"status": "ok" if db == "ok" else "degraded", "db": db}
