from fastapi import Header, HTTPException
from app.core.supabase_client import get_supabase_admin


async def get_current_user(authorization: str | None = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        response = get_supabase_admin().auth.get_user(token)
        return response.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_current_user_optional(authorization: str | None = Header(None)):
    if not authorization:
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None
