import re
import secrets
from typing import Any, cast

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.supabase_client import get_supabase_admin


def _row(result: Any) -> dict[str, Any] | None:
    """Safely extract a single-row dict from a Supabase response."""
    data = result.data if hasattr(result, "data") else result
    if isinstance(data, dict):
        return cast(dict[str, Any], data)
    return None


def _rows(result: Any) -> list[dict[str, Any]]:
    """Safely extract a list of rows from a Supabase response."""
    data = result.data if hasattr(result, "data") else result
    if isinstance(data, list):
        return cast(list[dict[str, Any]], data)
    return []

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
async def connect_repo(body: ConnectRepoRequest, request: Request, user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()

    # resolve plan + bypass
    prof_data = _row(db.table("profiles").select("plan,bypass_plan").eq("id", str(user.id)).maybe_single().execute()) or {}
    plan: str = str(prof_data.get("plan", "free"))
    bypass: bool = bool(prof_data.get("bypass_plan", False))

    # check repo limit
    limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])["repos"]
    if limit is not None and not bypass:
        existing = _rows(db.table("repos").select("id").eq("owner_id", str(user.id)).execute())
        if len(existing) >= limit:
            raise HTTPException(
                status_code=403,
                detail=f"Repo limit reached for {plan} plan ({limit}). Upgrade to connect more.",
            )

    try:
        full_name = _parse_full_name(body.repo_url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Prefer the user's own GitHub OAuth token (forwarded from the frontend session).
    # This ensures the webhook is installed using their credentials and scopes.
    # Falls back to the server PAT if the token wasn't forwarded.
    gh_token = request.headers.get("X-GitHub-Token") or settings.github_pat

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
    repo_row = _row(db.table("repos").select("id").eq("owner_id", str(user.id)).eq("full_name", full_name).maybe_single().execute())
    if repo_row:
        db.table("repo_members").upsert({
            "repo_id": repo_row["id"],
            "user_id": str(user.id),
            "github_login": user.user_metadata.get("user_name"),
            "role": "owner",
        }, on_conflict="repo_id,user_id").execute()

    return {"full_name": full_name, "webhook_id": webhook_id, "status": "connected"}


# ── list repos ────────────────────────────────────────────────────────────────

@router.get("/repos")
async def list_repos(user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()

    # repos user owns
    owned = _rows(db.table("repos").select("id,full_name,connected_at,webhook_id")
                  .eq("owner_id", str(user.id)).execute())

    # repos user is a member of (but doesn't own)
    member_rows = _rows(db.table("repo_members").select("repo_id").eq("user_id", str(user.id)).execute())
    member_ids = [r["repo_id"] for r in member_rows]
    member_repos = _rows(db.table("repos").select("id,full_name,connected_at,webhook_id")
                         .in_("id", member_ids).execute()) if member_ids else []

    # merge + deduplicate
    seen: set[str] = set()
    merged = []
    for repo in owned + member_repos:
        if repo["id"] not in seen:
            seen.add(repo["id"])
            merged.append(repo)

    return sorted(merged, key=lambda r: r.get("connected_at", ""), reverse=True)


# ── disconnect repo ───────────────────────────────────────────────────────────

@router.delete("/repos/{repo_id}")
async def disconnect_repo(repo_id: str, user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()
    row = _row(db.table("repos").select("*").eq("id", repo_id).eq("owner_id", str(user.id)).maybe_single().execute())
    if not row:
        raise HTTPException(status_code=404, detail="Repo not found or not your repo.")

    # remove webhook from GitHub
    if row.get("webhook_id"):
        async with httpx.AsyncClient() as client:
            await client.delete(
                f"https://api.github.com/repos/{row['full_name']}/hooks/{row['webhook_id']}",
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
    prof_data = _row(db.table("profiles").select("plan,bypass_plan").eq("id", str(user.id)).maybe_single().execute()) or {}
    plan = str(prof_data.get("plan", "free"))
    bypass = bool(prof_data.get("bypass_plan", False))
    limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])["members"]
    if limit is not None and not bypass:
        current = _rows(db.table("repo_members").select("user_id").eq("repo_id", repo_id).execute())
        if len(current) >= limit + 1:  # +1 for owner
            raise HTTPException(
                status_code=403,
                detail=f"Member limit reached for {plan} plan. Upgrade to add more.",
            )

    # look up GitHub user to get their Supabase id (if they've signed in)
    invited_user = _row(db.table("profiles").select("id").eq("github_login", body.github_login).maybe_single().execute())
    invited_user_id = invited_user["id"] if invited_user else None

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
    prof_data = _row(db.table("profiles").select("*").eq("id", str(user.id)).maybe_single().execute()) or {}
    return {
        "id": str(user.id),
        "email": user.email,
        "github_login": user.user_metadata.get("user_name"),
        "avatar_url": user.user_metadata.get("avatar_url"),
        "plan": prof_data.get("plan", "free"),
        "bypass_plan": prof_data.get("bypass_plan", False),
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
    prof_data = _row(db.table("profiles").select("bypass_plan").eq("id", str(user.id)).maybe_single().execute()) or {}
    if not prof_data.get("bypass_plan"):
        raise HTTPException(status_code=403, detail="Admin only.")

    if body.plan not in PLAN_LIMITS:
        raise HTTPException(status_code=422, detail=f"Unknown plan: {body.plan}")

    db.table("profiles").update({"plan": body.plan, "bypass_plan": body.bypass_plan}).eq("id", body.user_id).execute()
    return {"updated": True, "plan": body.plan}
