import base64
from typing import Any

import httpx

from app.core.config import settings

_API = "https://api.github.com"


def _headers() -> dict[str, str]:
    h = {"Accept": "application/vnd.github.v3+json", "X-GitHub-Api-Version": "2022-11-28"}
    if settings.github_pat:
        h["Authorization"] = f"Bearer {settings.github_pat}"
    return h


def get_file(repo: str, path: str, ref: str) -> tuple[str, str]:
    """Return (content, sha) for a file at the given ref."""
    resp = httpx.get(f"{_API}/repos/{repo}/contents/{path}", params={"ref": ref}, headers=_headers(), timeout=20)
    resp.raise_for_status()
    data = resp.json()
    content = base64.b64decode(data["content"]).decode()
    return content, data["sha"]


def commit_patch(repo: str, branch: str, path: str, new_content: str, sha: str, message: str) -> None:
    """Update a file on an existing branch."""
    payload = {
        "message": message,
        "content": base64.b64encode(new_content.encode()).decode(),
        "sha": sha,
        "branch": branch,
    }
    resp = httpx.put(f"{_API}/repos/{repo}/contents/{path}", json=payload, headers=_headers(), timeout=20)
    resp.raise_for_status()


def create_fix_pr(repo: str, head_branch: str, base_branch: str, title: str, body: str) -> dict[str, Any]:
    """Create a new PR from head_branch → base_branch."""
    payload = {"title": title, "body": body, "head": head_branch, "base": base_branch}
    resp = httpx.post(f"{_API}/repos/{repo}/pulls", json=payload, headers=_headers(), timeout=20)
    resp.raise_for_status()
    return resp.json()


def create_branch(repo: str, new_branch: str, from_ref: str) -> None:
    """Create a new branch from from_ref."""
    resp = httpx.get(f"{_API}/repos/{repo}/git/ref/heads/{from_ref}", headers=_headers(), timeout=20)
    resp.raise_for_status()
    sha = resp.json()["object"]["sha"]

    resp = httpx.post(
        f"{_API}/repos/{repo}/git/refs",
        json={"ref": f"refs/heads/{new_branch}", "sha": sha},
        headers=_headers(),
        timeout=20,
    )
    resp.raise_for_status()


def get_pr(repo: str, pr_number: int, wait_for_mergeable: bool = False) -> dict[str, Any]:
    """Return PR details. With wait_for_mergeable=True, retries briefly while GitHub
    computes the mergeable field asynchronously."""
    import time

    data: dict[str, Any] = {}
    attempts = 4 if wait_for_mergeable else 1
    for i in range(attempts):
        resp = httpx.get(f"{_API}/repos/{repo}/pulls/{pr_number}", headers=_headers(), timeout=20)
        resp.raise_for_status()
        data = resp.json()
        if not wait_for_mergeable or data.get("mergeable") is not None:
            break
        if i < attempts - 1:
            time.sleep(2)
    return data


def merge_pr(repo: str, pr_number: int) -> dict[str, Any]:
    """Merge a PR via squash merge."""
    resp = httpx.put(
        f"{_API}/repos/{repo}/pulls/{pr_number}/merge",
        json={"merge_method": "squash"},
        headers=_headers(),
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def apply_patch_to_content(original: str, patch: str) -> str:
    """Apply a unified diff patch to file content, returns new content."""
    import re
    lines = original.splitlines(keepends=True)
    result = list(lines)

    hunks = re.split(r"(?=^@@)", patch, flags=re.MULTILINE)
    offset = 0
    for hunk in hunks:
        if not hunk.startswith("@@"):
            continue
        header = re.match(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", hunk)
        if not header:
            continue
        orig_start = int(header.group(1)) - 1
        hunk_lines = hunk.splitlines(keepends=True)[1:]

        i = orig_start + offset
        for line in hunk_lines:
            if line.startswith("-"):
                if i < len(result):
                    result.pop(i)
                    offset -= 1
            elif line.startswith("+"):
                result.insert(i, line[1:])
                i += 1
                offset += 1
            else:
                i += 1

    return "".join(result)
