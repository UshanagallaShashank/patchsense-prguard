import asyncio
import hashlib
import json
import uuid
from typing import Any, AsyncGenerator, cast

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import Client

from app.core.auth import get_current_user
from app.core.supabase_client import get_supabase, get_supabase_admin
from app.schemas.review_schema import ReviewOut
from app.services.review_service import get_review, list_reviews

log = structlog.get_logger()

router = APIRouter(prefix="/api")


async def _get_stream_user(
    token: str | None = Query(None),
    authorization: str | None = Header(None),
):
    """Auth for SSE endpoints: accepts JWT via ?token= query param (EventSource
    cannot send custom headers) or the standard Authorization header."""
    raw: str | None = None
    if token:
        raw = token
    elif authorization and authorization.startswith("Bearer "):
        raw = authorization.removeprefix("Bearer ").strip()
    if not raw:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        resp = get_supabase_admin().auth.get_user(raw)
        if not resp or not resp.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return resp.user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _require_repo_active(repo_full_name: str) -> None:
    """Raise 403 if the repo is paused (active=False)."""
    admin = get_supabase_admin()
    row = admin.table("repos").select("active").eq("full_name", repo_full_name).maybe_single().execute()
    if row and row.data and cast(dict[str, Any], row.data).get("active") is False:
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
    user=Depends(_get_stream_user),
) -> StreamingResponse:
    user_id = str(user.id)

    async def generator() -> AsyncGenerator[str, None]:
        last_hash = ""
        gh_login = user.user_metadata.get("user_name")
        ticks = 0
        while True:
            if await request.is_disconnected():
                break
            try:
                data = list_reviews(client, page=1, user_id=user_id, admin_client=get_supabase_admin(), github_login=gh_login)
                serialized = json.dumps(data, default=str)
                h = hashlib.md5(serialized.encode()).hexdigest()
                if h != last_hash:
                    last_hash = h
                    yield f"data: {serialized}\n\n"
            except Exception as exc:
                log.warning("sse_poll_error", user_id=user_id, error=str(exc))
            # Send a keepalive comment every ~40s to prevent proxy timeouts.
            ticks += 1
            if ticks % 5 == 0:
                yield ": keepalive\n\n"
            await asyncio.sleep(8)

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
    request: Request,
    user=Depends(get_current_user),
) -> Any:
    from app.services.github_service import (
        get_file, commit_patch, create_branch, create_fix_pr, apply_patch_to_content
    )

    # Use the requesting user's GitHub OAuth token when provided so commits
    # are not falsely attributed to the server PAT owner.
    gh_token: str | None = request.headers.get("X-GitHub-Token") or None
    triggered_by: str | None = user.user_metadata.get("user_name")

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

    file_content, sha = get_file(repo, file_path, branch, token=gh_token)
    new_content = apply_patch_to_content(file_content, patch)
    commit_msg = f"fix: {finding['message'][:72]} (PatchSense auto-fix)"

    if body.mode == "pr":
        fix_branch = f"patchsense/fix-{body.finding_id[:8]}"
        create_branch(repo, fix_branch, branch, token=gh_token)
        _, new_sha = get_file(repo, file_path, fix_branch, token=gh_token)
        commit_patch(repo, fix_branch, file_path, new_content, new_sha, commit_msg,
                     token=gh_token, triggered_by=triggered_by)
        pr = create_fix_pr(
            repo,
            head_branch=fix_branch,
            base_branch=branch,
            title=f"fix: {finding['message'][:60]}",
            body=f"Auto-fix generated by PatchSense for finding in PR #{pr_number}.\n\n**Issue:** {finding['message']}\n\n**Suggestion:** {finding.get('suggestion', '')}",
            token=gh_token,
            triggered_by=triggered_by,
        )
        return {"mode": "pr", "pr_url": pr["html_url"], "pr_number": pr["number"]}
    else:
        commit_patch(repo, branch, file_path, new_content, sha, commit_msg,
                     token=gh_token, triggered_by=triggered_by)
        return {"mode": "commit", "branch": branch, "file": file_path}


# ── fix all ──────────────────────────────────────────────────────────────────

@router.post("/reviews/{review_id}/fix-all")
async def fix_all_findings(
    review_id: uuid.UUID,
    request: Request,
    user=Depends(get_current_user),
) -> Any:
    """Generate patches for every finding (if not already done), apply them all
    to a single branch, and open one PR — one fix, one commit, one review."""
    from app.agents.fix_agent import generate_fix as ai_fix
    from app.services.github_service import (
        get_file, commit_patch, create_branch, create_fix_pr, apply_patch_to_content
    )

    gh_token: str | None = request.headers.get("X-GitHub-Token") or None
    triggered_by: str | None = user.user_metadata.get("user_name")

    admin = get_supabase_admin()
    review = get_review(admin, review_id, user_id=str(user.id), admin_client=admin)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    _require_repo_active(review["repo_full_name"])

    findings = review.get("findings", [])
    if not findings:
        raise HTTPException(status_code=400, detail="No findings to fix")

    repo       = review["repo_full_name"]
    pr_number  = review["pr_number"]
    head_branch = review.get("head_branch") or review.get("pr_branch")
    base_branch = review.get("base_branch") or "main"
    if not head_branch:
        raise HTTPException(status_code=400, detail="PR branch not available")

    fix_branch = f"patchsense/fix-all-pr-{pr_number}"

    # Step 1: Ensure every finding has a patch (generate missing ones).
    for f in findings:
        if f.get("patch"):
            continue
        try:
            file_content, _ = get_file(repo, f["file_path"], head_branch, token=gh_token)
            patch = await ai_fix(f["file_path"], file_content, f)
            if patch:
                admin.table("findings").update({"patch": patch}).eq("id", str(f["id"])).execute()
                f["patch"] = patch
        except Exception as exc:
            log.warning("fix_all_generate_failed", finding_id=str(f["id"]), error=str(exc))

    fixable = [f for f in findings if f.get("patch") and f.get("file_path")]
    if not fixable:
        raise HTTPException(status_code=422, detail="Could not generate any patches")

    # Step 2: Group patches by file so we apply them in sequence per file.
    from collections import defaultdict
    patches_by_file: dict[str, list[dict]] = defaultdict(list)
    for f in fixable:
        patches_by_file[f["file_path"]].append(f)

    # Step 3: Create the fix branch.
    try:
        create_branch(repo, fix_branch, head_branch, token=gh_token)
    except Exception as exc:
        # Branch may already exist from a previous attempt — continue.
        log.warning("fix_all_create_branch", branch=fix_branch, error=str(exc))

    # Step 4: Apply all patches per file with one commit per file.
    applied: list[str] = []
    skipped: list[str] = []
    for file_path, file_findings in patches_by_file.items():
        try:
            content, sha = get_file(repo, file_path, fix_branch, token=gh_token)
            for f in file_findings:
                try:
                    content = apply_patch_to_content(content, f["patch"])
                    applied.append(f["message"][:60])
                except Exception:
                    skipped.append(f["message"][:60])
            severities = ", ".join(sorted({f["severity"] for f in file_findings}, key=lambda s: ["critical","high","medium","low","info"].index(s)))
            commit_msg = f"fix({file_path}): apply PatchSense fixes [{severities}]"
            commit_patch(repo, fix_branch, file_path, content, sha, commit_msg,
                         token=gh_token, triggered_by=triggered_by)
        except Exception as exc:
            log.warning("fix_all_commit_failed", file=file_path, error=str(exc))
            skipped.extend(f["message"][:60] for f in file_findings)

    if not applied:
        raise HTTPException(status_code=422, detail="All patches failed to apply")

    # Step 5: Open one PR summarising all fixes.
    applied_bullets  = "\n".join(f"- {m}" for m in applied)
    skipped_bullets  = ("\n\n**Skipped (conflicting patches):**\n" + "\n".join(f"- {m}" for m in skipped)) if skipped else ""
    pr_body = (
        f"## PatchSense — Fix All\n\n"
        f"Auto-generated fixes for **{len(applied)} finding(s)** found in PR #{pr_number}.\n\n"
        f"**Applied:**\n{applied_bullets}{skipped_bullets}"
    )
    try:
        pr = create_fix_pr(
            repo,
            head_branch=fix_branch,
            base_branch=head_branch,
            title=f"fix: PatchSense auto-fix {len(applied)} issue(s) from PR #{pr_number}",
            body=pr_body,
            token=gh_token,
            triggered_by=triggered_by,
        )
        return {"pr_url": pr["html_url"], "pr_number": pr["number"], "applied": len(applied), "skipped": len(skipped)}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not open PR: {exc}")


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
