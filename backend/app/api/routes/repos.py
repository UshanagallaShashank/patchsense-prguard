import re
import secrets
import uuid
from typing import Any, cast

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.supabase_client import get_supabase_admin


def _row(result: Any) -> dict[str, Any] | None:
    data = result.data if hasattr(result, "data") else result
    if isinstance(data, dict):
        return cast(dict[str, Any], data)
    return None


def _rows(result: Any) -> list[dict[str, Any]]:
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
    m = re.search(r"github\.com[:/]([\w.\-]+/[\w.\-]+?)(?:\.git)?$", raw)
    if m:
        return m.group(1)
    if re.fullmatch(r"[\w.\-]+/[\w.\-]+", raw):
        return raw
    raise ValueError(f"Cannot parse repo: {raw!r}")


def _require_admin(user: Any, db: Any) -> None:
    prof = _row(db.table("profiles").select("is_admin").eq("id", str(user.id)).maybe_single().execute()) or {}
    if not prof.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only.")


# ── connect repo ──────────────────────────────────────────────────────────────

class ConnectRepoRequest(BaseModel):
    repo_url: str


@router.post("/repos/connect")
async def connect_repo(body: ConnectRepoRequest, request: Request, user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()

    prof_data = _row(db.table("profiles").select("plan,is_admin").eq("id", str(user.id)).maybe_single().execute()) or {}
    plan: str = str(prof_data.get("plan", "free"))
    is_admin: bool = bool(prof_data.get("is_admin", False))

    limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])["repos"]
    if limit is not None and not is_admin:
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

    gh_token = request.headers.get("X-GitHub-Token") or settings.github_pat
    webhook_secret = secrets.token_hex(32)
    webhook_url = f"{settings.render_external_url}/webhook"

    async with httpx.AsyncClient() as client:
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
            webhook_id = None
        elif hook_resp.status_code == 201:
            webhook_id = hook_resp.json().get("id")
        else:
            raise HTTPException(status_code=502, detail=f"Failed to install webhook: {hook_resp.text}")

    db.table("repos").upsert({
        "owner_id": str(user.id),
        "full_name": full_name,
        "webhook_id": webhook_id,
        "webhook_secret": webhook_secret,
    }, on_conflict="owner_id,full_name").execute()

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

    owned = _rows(db.table("repos").select("id,full_name,connected_at,webhook_id,active")
                  .eq("owner_id", str(user.id)).execute())

    member_rows = _rows(db.table("repo_members").select("repo_id").eq("user_id", str(user.id)).execute())
    member_ids = [r["repo_id"] for r in member_rows]
    member_repos = _rows(db.table("repos").select("id,full_name,connected_at,webhook_id,active")
                         .in_("id", member_ids).execute()) if member_ids else []

    seen: set[str] = set()
    merged = []
    for repo in owned + member_repos:
        if repo["id"] not in seen:
            seen.add(repo["id"])
            merged.append({**repo, "is_owner": repo in owned})

    # Normalize NULL active → True so the frontend never gets null.
    for repo in merged:
        if repo.get("active") is None:
            repo["active"] = True
    return sorted(merged, key=lambda r: r.get("connected_at", ""), reverse=True)


# ── toggle repo active ────────────────────────────────────────────────────────

class ToggleActiveRequest(BaseModel):
    active: bool


@router.patch("/repos/{repo_id}/active")
async def toggle_repo_active(repo_id: str, body: ToggleActiveRequest, user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()
    row = _row(db.table("repos").select("id").eq("id", repo_id).eq("owner_id", str(user.id)).maybe_single().execute())
    if not row:
        raise HTTPException(status_code=404, detail="Repo not found or not your repo.")
    db.table("repos").update({"active": body.active}).eq("id", repo_id).execute()
    return {"active": body.active}


# ── disconnect repo ───────────────────────────────────────────────────────────

@router.delete("/repos/{repo_id}")
async def disconnect_repo(repo_id: str, user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()
    row = _row(db.table("repos").select("*").eq("id", repo_id).eq("owner_id", str(user.id)).maybe_single().execute())
    if not row:
        raise HTTPException(status_code=404, detail="Repo not found or not your repo.")

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

    owner = db.table("repos").select("id").eq("id", repo_id).eq("owner_id", str(user.id)).execute()
    if not owner.data:
        raise HTTPException(status_code=403, detail="Only the repo owner can invite members.")

    prof_data = _row(db.table("profiles").select("plan,is_admin").eq("id", str(user.id)).maybe_single().execute()) or {}
    plan = str(prof_data.get("plan", "free"))
    is_admin = bool(prof_data.get("is_admin", False))
    limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])["members"]
    if limit is not None and not is_admin:
        current = _rows(db.table("repo_members").select("user_id").eq("repo_id", repo_id).execute())
        if len(current) >= limit + 1:
            raise HTTPException(
                status_code=403,
                detail=f"Member limit reached for {plan} plan. Upgrade to add more.",
            )

    invited_user = _row(db.table("profiles").select("id").eq("github_login", body.github_login).maybe_single().execute())
    invited_user_id: str = invited_user["id"] if invited_user else str(uuid.uuid5(uuid.NAMESPACE_URL, f"pending:{body.github_login}"))

    db.table("repo_members").upsert({
        "repo_id": repo_id,
        "user_id": invited_user_id,
        "github_login": body.github_login,
        "role": body.role,
        "invited_by": str(user.id),
    }, on_conflict="repo_id,user_id").execute()

    return {"invited": body.github_login, "found_in_system": invited_user is not None, "role": body.role}


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
        "is_admin": prof_data.get("is_admin", False),
    }


# ── me: update plan ───────────────────────────────────────────────────────────

class UpdatePlanRequest(BaseModel):
    plan: str


@router.post("/me/plan")
async def update_my_plan(body: UpdatePlanRequest, user=Depends(get_current_user)) -> Any:
    if body.plan not in PLAN_LIMITS:
        raise HTTPException(status_code=422, detail=f"Unknown plan: {body.plan}")
    db = get_supabase_admin()
    db.table("profiles").upsert({"id": str(user.id), "plan": body.plan}).execute()
    return {"plan": body.plan}


# ── admin: set plan ───────────────────────────────────────────────────────────

class SetPlanRequest(BaseModel):
    user_id: str
    plan: str


@router.post("/admin/set-plan")
async def admin_set_plan(body: SetPlanRequest, user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()
    _require_admin(user, db)
    if body.plan not in PLAN_LIMITS:
        raise HTTPException(status_code=422, detail=f"Unknown plan: {body.plan}")
    db.table("profiles").update({"plan": body.plan}).eq("id", body.user_id).execute()
    return {"updated": True, "plan": body.plan}


# ── admin: list users ─────────────────────────────────────────────────────────

@router.get("/admin/users")
async def admin_list_users(user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()
    _require_admin(user, db)

    profiles = _rows(db.table("profiles").select("id,github_login,github_avatar_url,plan,is_admin,created_at").execute())
    repos = _rows(db.table("repos").select("id,owner_id,full_name,active,connected_at").execute())
    reviews = _rows(db.table("reviews").select("id,repo_full_name,created_at").execute())

    repo_counts: dict[str, int] = {}
    repo_by_owner: dict[str, list[dict[str, Any]]] = {}
    for r in repos:
        owner = r["owner_id"]
        repo_counts[owner] = repo_counts.get(owner, 0) + 1
        repo_by_owner.setdefault(owner, []).append(r)

    review_counts: dict[str, int] = {}
    for rv in reviews:
        name = rv.get("repo_full_name", "")
        review_counts[name] = review_counts.get(name, 0) + 1

    result = []
    for p in profiles:
        uid = p["id"]
        user_repos = repo_by_owner.get(uid, [])
        result.append({
            **p,
            "repo_count": repo_counts.get(uid, 0),
            "repos": [
                {**rp, "review_count": review_counts.get(rp["full_name"], 0)}
                for rp in user_repos
            ],
        })

    return sorted(result, key=lambda u: u.get("created_at", ""), reverse=True)


# ── admin: stats ──────────────────────────────────────────────────────────────

_PLAN_PRICES: dict[str, int] = {"free": 0, "pro": 9, "team": 29}


@router.get("/admin/stats")
async def admin_stats(user=Depends(get_current_user)) -> Any:
    db = get_supabase_admin()
    _require_admin(user, db)

    profiles = _rows(db.table("profiles").select("plan").execute())
    repos    = _rows(db.table("repos").select("id,active,webhook_id").execute())
    reviews  = _rows(db.table("reviews").select("id,status,created_at").execute())

    plan_counts: dict[str, int] = {"free": 0, "pro": 0, "team": 0}
    for p in profiles:
        plan = p.get("plan", "free") or "free"
        plan_counts[plan] = plan_counts.get(plan, 0) + 1

    mrr = sum(_PLAN_PRICES.get(p.get("plan", "free") or "free", 0) for p in profiles)

    status_counts: dict[str, int] = {}
    for rv in reviews:
        s = rv.get("status") or "unknown"
        status_counts[s] = status_counts.get(s, 0) + 1

    return {
        "users": {
            "total": len(profiles),
            "by_plan": plan_counts,
        },
        "repos": {
            "total": len(repos),
            "active": sum(1 for r in repos if r.get("active") is not False),
            "inactive": sum(1 for r in repos if r.get("active") is False),
            "no_webhook": sum(1 for r in repos if not r.get("webhook_id")),
        },
        "reviews": {
            "total": len(reviews),
            "by_status": status_counts,
            "completed": status_counts.get("completed", 0),
            "failed": status_counts.get("failed", 0),
        },
        "revenue": {
            "mrr_estimate": mrr,
        },
    }


@router.get("/admin/activity")
async def admin_activity(user=Depends(get_current_user)) -> Any:
    """Return the 25 most recent reviews across all users for the activity feed."""
    db = get_supabase_admin()
    _require_admin(user, db)
    return _rows(
        db.table("reviews")
        .select("id,repo_full_name,pr_number,pr_title,status,pr_state,created_at,author_login")
        .order("created_at", desc=True)
        .limit(25)
        .execute()
    )
