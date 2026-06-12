import asyncio
import hashlib
import json
import uuid
from typing import Any, AsyncGenerator

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import Client

from app.core.supabase_client import get_supabase
from app.schemas.review_schema import ReviewOut
from app.services.review_service import get_review, list_reviews

router = APIRouter(prefix="/api")


# ── list / get ────────────────────────────────────────────────────────────────

@router.get("/reviews", response_model=list[ReviewOut])
def get_reviews(page: int = 1, client: Client = Depends(get_supabase)) -> Any:
    return list_reviews(client, page)


# Must be declared BEFORE /{review_id} so "stream" isn't treated as a UUID path param
@router.get("/reviews/stream")
async def stream_reviews(request: Request, client: Client = Depends(get_supabase)) -> StreamingResponse:
    """SSE endpoint — pushes a data event whenever the reviews list changes (~3s latency)."""

    async def generator() -> AsyncGenerator[str, None]:
        last_hash = ""
        while True:
            if await request.is_disconnected():
                break
            try:
                data = list_reviews(client, page=1)
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
def get_review_by_id(review_id: uuid.UUID, client: Client = Depends(get_supabase)) -> Any:
    review = get_review(client, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    return review


# ── AI fix ───────────────────────────────────────────────────────────────────

@router.post("/reviews/{review_id}/findings/{finding_id}/fix")
async def generate_fix(
    review_id: uuid.UUID,
    finding_id: uuid.UUID,
    client: Client = Depends(get_supabase),
) -> Any:
    from app.agents.fix_agent import generate_fix as ai_fix
    from app.services.github_service import get_file

    review = get_review(client, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

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

    # Persist patch on the finding
    client.table("findings").update({"patch": patch}).eq("id", str(finding_id)).execute()

    return {"patch": patch, "file_path": file_path}


# ── apply fix ────────────────────────────────────────────────────────────────

class ApplyFixRequest(BaseModel):
    finding_id: str
    mode: str = "commit"  # "commit" | "pr"


@router.post("/reviews/{review_id}/apply-fix")
def apply_fix(
    review_id: uuid.UUID,
    body: ApplyFixRequest,
    client: Client = Depends(get_supabase),
) -> Any:
    from app.services.github_service import (
        get_file, commit_patch, create_branch, create_fix_pr, apply_patch_to_content
    )

    review = get_review(client, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

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


# ── merge PR ─────────────────────────────────────────────────────────────────

@router.post("/reviews/{review_id}/merge")
def merge_review_pr(
    review_id: uuid.UUID,
    client: Client = Depends(get_supabase),
) -> Any:
    import httpx
    from app.services.github_service import merge_pr, _headers, _API

    review = get_review(client, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    repo = review["repo_full_name"]
    pr_number = review["pr_number"]

    # Always fetch current state from GitHub before attempting
    gh = httpx.get(f"{_API}/repos/{repo}/pulls/{pr_number}", headers=_headers(), timeout=10)
    if gh.is_success:
        gh_state = gh.json()
        if gh_state.get("merged"):
            client.table("reviews").update({"pr_state": "merged"}).eq("id", str(review_id)).execute()
            return {"merged": True, "already_merged": True}
        if gh_state.get("state") == "closed":
            client.table("reviews").update({"pr_state": "closed"}).eq("id", str(review_id)).execute()
            raise HTTPException(status_code=400, detail="PR is already closed")

    try:
        result = merge_pr(repo, pr_number)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GitHub merge failed: {e}")

    client.table("reviews").update({"pr_state": "merged"}).eq("id", str(review_id)).execute()
    return {"merged": True, "sha": result.get("sha")}
