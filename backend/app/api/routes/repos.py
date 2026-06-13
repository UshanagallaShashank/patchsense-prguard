import re
import secrets
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.supabase_client import get_supabase_admin

router = APIRouter(prefix="/api")

PLAN_LIMITS: dict[str, dict[str, int | None]] = {
    "free": {"repos": 1,    "members": 0},
    "pro":  {"repos": 10,   "members": 5},
    "team": {"repos": None, "members": None},
}


def _gh_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}


def _parse_full_name(raw: str) -> str:
    raw = raw.strip().rstrip("/")
    # Accept full URL or owner/repo
    m = re.search(r"github\.com[:/]([\w.\-]+/[\w.\-]+?)(?:\.git)?$", raw)
    if m:
        return m.group(1)
    if re.fullmatch(r"[\w.\-]+/[\w.\-]+", raw):
        return raw
    raise ValueError(f"Cannot parse repo: {raw!r}")


# ── connect repo ──────────────────────────────────────────────────────────────

class ConnectRepoRequest(BaseModel):
    repo_url: str


@router.post("/repos/connect")
async def connect_repo(body: ConnectRepoRequest, user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()

    # resolve plan + bypass
    prof = db.table("profiles").select("plan,bypass_plan").eq("id", str(user.id)).single().execute()
    plan: str = prof.data.get("plan", "free") if prof.data else "free"
    bypass: bool = prof.data.get("bypass_plan", False) if prof.data else False

    # check repo limit
    limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])["repos"]
    if limit is not None and not bypass:
        existing = db.table("repos").select("id", count="exact").eq("owner_id", str(user.id)).execute()
        if (existing.count or 0) >= limit:
            raise HTTPException(
                status_code=403,
                detail=f"Repo limit reached for {plan} plan ({limit}). Upgrade to connect more.",
            )

    try:
        full_name = _parse_full_name(body.repo_url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # get GitHub token from Supabase session
    # provider token not available via admin API — use PAT for webhook install
    gh_token = settings.github_pat

    # install webhook on GitHub
    webhook_secret = secrets.token_hex(32)
    webhook_url = f"{settings.render_external_url}/webhook"

    async with httpx.AsyncClient() as client:
        # verify repo exists and user has admin access
        repo_resp = await client.get(
            f"https://api.github.com/repos/{full_name}",
            headers=_gh_headers(gh_token),
        )
        if repo_resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Repo not found or not accessible.")
        if repo_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="GitHub API error checking repo.")

        repo_data = repo_resp.json()
        if not repo_data.get("permissions", {}).get("admin"):
            raise HTTPException(status_code=403, detail="You need admin access to this repo to install a webhook.")

        # install webhook
        hook_resp = await client.post(
            f"https://api.github.com/repos/{full_name}/hooks",
            headers=_gh_headers(gh_token),
            json={
                "name": "web",
                "active": True,
                "events": ["pull_request"],
                "config": {
                    "url": webhook_url,
                    "content_type": "json",
                    "secret": webhook_secret,
                    "insecure_ssl": "0",
                },
            },
        )
        if hook_resp.status_code == 422:
            # webhook already exists — that's fine, just upsert the record
            webhook_id = None
        elif hook_resp.status_code == 201:
            webhook_id = hook_resp.json().get("id")
        else:
            raise HTTPException(status_code=502, detail=f"Failed to install webhook: {hook_resp.text}")

    # upsert repo record
    db.table("repos").upsert({
        "owner_id": str(user.id),
        "full_name": full_name,
        "webhook_id": webhook_id,
        "webhook_secret": webhook_secret,
    }, on_conflict="owner_id,full_name").execute()

    # add owner as a member too (for lookup convenience)
    repo_row = db.table("repos").select("id").eq("owner_id", str(user.id)).eq("full_name", full_name).single().execute()
    if repo_row.data:
        db.table("repo_members").upsert({
            "repo_id": repo_row.data["id"],
            "user_id": str(user.id),
            "github_login": user.user_metadata.get("user_name"),
            "role": "owner",
        }, on_conflict="repo_id,user_id").execute()

    return {"full_name": full_name, "webhook_id": webhook_id, "status": "connected"}


# ── list repos ────────────────────────────────────────────────────────────────

@router.get("/repos")
async def list_repos(user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()
    rows = db.table("repos").select("id,full_name,connected_at,webhook_id").or_(
        f"owner_id.eq.{user.id},"
        f"id.in.(select repo_id from repo_members where user_id = '{user.id}')"
    ).order("connected_at", desc=True).execute()
    return rows.data or []


# ── disconnect repo ───────────────────────────────────────────────────────────

@router.delete("/repos/{repo_id}")
async def disconnect_repo(repo_id: str, user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()
    row = db.table("repos").select("*").eq("id", repo_id).eq("owner_id", str(user.id)).single().execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Repo not found or not your repo.")

    # remove webhook from GitHub
    if row.data.get("webhook_id"):
        async with httpx.AsyncClient() as client:
            await client.delete(
                f"https://api.github.com/repos/{row.data['full_name']}/hooks/{row.data['webhook_id']}",
                headers=_gh_headers(settings.github_pat),
            )

    db.table("repos").delete().eq("id", repo_id).execute()
    return {"deleted": True}


# ── team members ──────────────────────────────────────────────────────────────

class InviteMemberRequest(BaseModel):
    github_login: str
    role: str = "member"


@router.get("/repos/{repo_id}/members")
async def list_members(repo_id: str, user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()
    rows = db.table("repo_members").select("user_id,github_login,role,invited_at").eq("repo_id", repo_id).execute()
    return rows.data or []


@router.post("/repos/{repo_id}/members")
async def invite_member(repo_id: str, body: InviteMemberRequest, user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()

    # only owner can invite
    owner = db.table("repos").select("id").eq("id", repo_id).eq("owner_id", str(user.id)).execute()
    if not owner.data:
        raise HTTPException(status_code=403, detail="Only the repo owner can invite members.")

    # check member limit
    prof = db.table("profiles").select("plan,bypass_plan").eq("id", str(user.id)).single().execute()
    plan = prof.data.get("plan", "free") if prof.data else "free"
    bypass = prof.data.get("bypass_plan", False) if prof.data else False
    limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])["members"]
    if limit is not None and not bypass:
        current = db.table("repo_members").select("user_id", count="exact").eq("repo_id", repo_id).execute()
        if (current.count or 0) >= limit + 1:  # +1 for owner
            raise HTTPException(
                status_code=403,
                detail=f"Member limit reached for {plan} plan. Upgrade to add more.",
            )

    # look up GitHub user to get their Supabase id (if they've signed in)
    invited_user = db.table("profiles").select("id").eq("github_login", body.github_login).single().execute()
    invited_user_id = invited_user.data["id"] if invited_user.data else None

    db.table("repo_members").upsert({
        "repo_id": repo_id,
        "user_id": invited_user_id or str(user.id),  # placeholder if not signed up yet
        "github_login": body.github_login,
        "role": body.role,
        "invited_by": str(user.id),
    }, on_conflict="repo_id,user_id").execute()

    return {"invited": body.github_login, "role": body.role}


@router.delete("/repos/{repo_id}/members/{member_login}")
async def remove_member(repo_id: str, member_login: str, user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()
    owner = db.table("repos").select("id").eq("id", repo_id).eq("owner_id", str(user.id)).execute()
    if not owner.data:
        raise HTTPException(status_code=403, detail="Only the repo owner can remove members.")
    db.table("repo_members").delete().eq("repo_id", repo_id).eq("github_login", member_login).execute()
    return {"removed": member_login}


# ── me ────────────────────────────────────────────────────────────────────────

@router.get("/me")
async def get_me(user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()
    prof = db.table("profiles").select("*").eq("id", str(user.id)).single().execute()
    return {
        "id": str(user.id),
        "email": user.email,
        "github_login": user.user_metadata.get("user_name"),
        "avatar_url": user.user_metadata.get("avatar_url"),
        "plan": prof.data.get("plan", "free") if prof.data else "free",
        "bypass_plan": prof.data.get("bypass_plan", False) if prof.data else False,
    }


# ── admin: set plan ───────────────────────────────────────────────────────────

class SetPlanRequest(BaseModel):
    user_id: str
    plan: str
    bypass_plan: bool = False


@router.post("/admin/set-plan")
async def admin_set_plan(body: SetPlanRequest, user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()
    # only users with bypass_plan can call this
    prof = db.table("profiles").select("bypass_plan").eq("id", str(user.id)).single().execute()
    if not (prof.data and prof.data.get("bypass_plan")):
        raise HTTPException(status_code=403, detail="Admin only.")

    if body.plan not in PLAN_LIMITS:
        raise HTTPException(status_code=422, detail=f"Unknown plan: {body.plan}")

    db.table("profiles").update({"plan": body.plan, "bypass_plan": body.bypass_plan}).eq("id", body.user_id).execute()
    return {"updated": True, "plan": body.plan}
