import asyncio
import hashlib
import json
import uuid
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import Client

from app.core.auth import get_current_user
from app.core.supabase_client import get_supabase, get_supabase_admin
from app.schemas.review_schema import ReviewOut
from app.services.review_service import get_review, list_reviews

router = APIRouter(prefix="/api")


def _require_repo_active(repo_full_name: str) -> None:
    """Raise 403 if the repo is paused (active=False)."""
    admin = get_supabase_admin()
    row = admin.table("repos").select("active").eq("full_name", repo_full_name).maybe_single().execute()
    if row and row.data and row.data.get("active") is False:
        raise HTTPException(status_code=403, detail="This repo is paused. Resume it in Settings → Repos to use this feature.")


# ── list / get ────────────────────────────────────────────────────────────────

@router.get("/reviews", response_model=list[ReviewOut])
def get_reviews(
    page: int = 1,
    client: Client = Depends(get_supabase),
    user=Depends(get_current_user),
) -> Any:
    return list_reviews(
        client, page,
        user_id=str(user.id),
        admin_client=get_supabase_admin(),
        github_login=user.user_metadata.get("user_name"),
    )


@router.get("/reviews/stream")
async def stream_reviews(
    request: Request,
    client: Client = Depends(get_supabase),
    user=Depends(get_current_user),
) -> StreamingResponse:
    user_id = str(user.id)

    async def generator() -> AsyncGenerator[str, None]:
        last_hash = ""
        while True:
            if await request.is_disconnected():
                break
            try:
                gh_login = user.user_metadata.get("user_name")
                data = list_reviews(client, page=1, user_id=user_id, admin_client=get_supabase_admin(), github_login=gh_login)
                serialized = json.dumps(data, default=str)
                h = hashlib.md5(serialized.encode()).hexdigest()
                if h != last_hash:
                    last_hash = h
                    yield f"data: {serialized}\n\n"
            except Exception:
                pass
            await asyncio.sleep(3)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.get("/reviews/{review_id}", response_model=ReviewOut)
def get_review_by_id(
    review_id: uuid.UUID,
    client: Client = Depends(get_supabase),
    user=Depends(get_current_user),
) -> Any:
    review = get_review(
        client, review_id,
        user_id=str(user.id),
        admin_client=get_supabase_admin(),
        github_login=user.user_metadata.get("user_name"),
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    return review


# ── AI fix ───────────────────────────────────────────────────────────────────

@router.post("/reviews/{review_id}/findings/{finding_id}/fix")
async def generate_fix(
    review_id: uuid.UUID,
    finding_id: uuid.UUID,
    client: Client = Depends(get_supabase),
    user=Depends(get_current_user),
) -> Any:
    from app.agents.fix_agent import generate_fix as ai_fix
    from app.services.github_service import get_file

    review = get_review(client, review_id, user_id=str(user.id), admin_client=get_supabase_admin())
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    _require_repo_active(review["repo_full_name"])

    findings = review.get("findings", [])
    finding = next((f for f in findings if str(f["id"]) == str(finding_id)), None)
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    branch = review.get("head_branch") or review.get("pr_branch")
    if not branch:
        raise HTTPException(status_code=400, detail="PR branch not available — cannot fetch file")

    repo = review["repo_full_name"]
    file_path = finding["file_path"]

    try:
        file_content, _ = get_file(repo, file_path, branch)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch file from GitHub: {e}")

    patch = await ai_fix(file_path, file_content, finding)
    if not patch:
        raise HTTPException(status_code=422, detail="AI could not generate a valid patch")

    get_supabase_admin().table("findings").update({"patch": patch}).eq("id", str(finding_id)).execute()
    return {"patch": patch, "file_path": file_path}


# ── apply fix ────────────────────────────────────────────────────────────────

class ApplyFixRequest(BaseModel):
    finding_id: str
    mode: str = "commit"  # "commit" | "pr"


@router.post("/reviews/{review_id}/apply-fix")
def apply_fix(
    review_id: uuid.UUID,
    body: ApplyFixRequest,
    user=Depends(get_current_user),
) -> Any:
    from app.services.github_service import (
        get_file, commit_patch, create_branch, create_fix_pr, apply_patch_to_content
    )

    admin = get_supabase_admin()
    review = get_review(admin, review_id, user_id=str(user.id), admin_client=admin)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    _require_repo_active(review["repo_full_name"])

    findings = review.get("findings", [])
    finding = next((f for f in findings if str(f["id"]) == body.finding_id), None)
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    patch = finding.get("patch")
    if not patch:
        raise HTTPException(status_code=400, detail="No patch generated yet — call /fix first")

    repo = review["repo_full_name"]
    pr_number = review["pr_number"]
    branch = review.get("head_branch") or review.get("pr_branch")
    file_path = finding["file_path"]

    file_content, sha = get_file(repo, file_path, branch)
    new_content = apply_patch_to_content(file_content, patch)
    commit_msg = f"fix: {finding['message'][:72]} (PatchSense auto-fix)"

    if body.mode == "pr":
        fix_branch = f"patchsense/fix-{body.finding_id[:8]}"
        create_branch(repo, fix_branch, branch)
        _, new_sha = get_file(repo, file_path, fix_branch)
        commit_patch(repo, fix_branch, file_path, new_content, new_sha, commit_msg)
        pr = create_fix_pr(
            repo,
            head_branch=fix_branch,
            base_branch=branch,
            title=f"fix: {finding['message'][:60]}",
            body=f"Auto-fix generated by PatchSense for finding in PR #{pr_number}.\n\n**Issue:** {finding['message']}\n\n**Suggestion:** {finding.get('suggestion', '')}",
        )
        return {"mode": "pr", "pr_url": pr["html_url"], "pr_number": pr["number"]}
    else:
        commit_patch(repo, branch, file_path, new_content, sha, commit_msg)
        return {"mode": "commit", "branch": branch, "file": file_path}


# ── conflict details ─────────────────────────────────────────────────────────

@router.get("/reviews/{review_id}/conflict-details")
def get_conflict_details(
    review_id: uuid.UUID,
    client: Client = Depends(get_supabase),
    user=Depends(get_current_user),
) -> Any:
    from app.services.github_service import get_file, get_pr, get_pr_files
    import difflib

    review = get_review(client, review_id, user_id=str(user.id), admin_client=get_supabase_admin())
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    head_branch: str = review.get("head_branch") or ""
    base_branch: str = review.get("base_branch") or "main"
    repo: str = review["repo_full_name"]
    pr_number: int = review["pr_number"]
    conflict_files: list[str] = review.get("conflict_files") or []

    if not head_branch:
        return {"head_branch": "", "base_branch": base_branch, "files": []}

    if not conflict_files:
        try:
            pr_meta = get_pr(repo, pr_number, wait_for_mergeable=True)
            base_branch = pr_meta.get("base", {}).get("ref", "main")
            if pr_meta.get("mergeable") is False:
                conflict_files = get_pr_files(repo, pr_number)
                get_supabase_admin().table("reviews").update({
                    "conflict_files": conflict_files,
                    "base_branch": base_branch,
                }).eq("id", str(review_id)).execute()
        except Exception:
            pass

    files = []
    for path in conflict_files:
        entry: dict[str, Any] = {"filename": path, "head_content": None, "base_content": None, "diff": None}
        try:
            entry["head_content"], _ = get_file(repo, path, head_branch)
        except Exception:
            pass
        try:
            entry["base_content"], _ = get_file(repo, path, base_branch)
        except Exception:
            pass

        if entry["head_content"] is not None and entry["base_content"] is not None:
            diff_lines = list(difflib.unified_diff(
                entry["base_content"].splitlines(keepends=True),
                entry["head_content"].splitlines(keepends=True),
                fromfile=f"main/{base_branch}",
                tofile=f"your branch/{head_branch}",
                lineterm="",
            ))
            entry["diff"] = "".join(diff_lines)
        files.append(entry)

    return {"head_branch": head_branch, "base_branch": base_branch, "files": files}


# ── merge PR ─────────────────────────────────────────────────────────────────

@router.post("/reviews/{review_id}/merge")
def merge_review_pr(
    review_id: uuid.UUID,
    client: Client = Depends(get_supabase),
    user=Depends(get_current_user),
) -> Any:
    from app.services.github_service import get_pr, merge_pr

    review = get_review(client, review_id, user_id=str(user.id), admin_client=get_supabase_admin())
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    _require_repo_active(review["repo_full_name"])

    if review.get("pr_state") != "open":
        raise HTTPException(status_code=400, detail="PR is not open")

    try:
        pr = get_pr(review["repo_full_name"], review["pr_number"], wait_for_mergeable=True)
    except Exception:
        raise HTTPException(status_code=502, detail="Could not check PR mergeability with GitHub")

    mergeable_state = pr.get("mergeable_state") or "unknown"
    get_supabase_admin().table("reviews").update({"mergeable_state": mergeable_state}).eq("id", str(review_id)).execute()

    if pr.get("mergeable") is False:
        raise HTTPException(
            status_code=409,
            detail="PR has merge conflicts with the base branch — resolve them on GitHub first.",
        )

    try:
        result = merge_pr(review["repo_full_name"], review["pr_number"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GitHub merge failed: {e}")

    get_supabase_admin().table("reviews").update({"pr_state": "merged"}).eq("id", str(review_id)).execute()
    return {"merged": True, "sha": result.get("sha")}
