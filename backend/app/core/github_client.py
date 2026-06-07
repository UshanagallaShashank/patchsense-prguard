"""GitHub API client supporting both GitHub App auth and PAT auth.

Auth priority:
  1. GITHUB_PAT — simplest, works for any repo the PAT has access to
  2. GitHub App JWT + installation token — required for webhook-triggered reviews
"""
import httpx

from app.core.config import settings

GITHUB_API = "https://api.github.com"
_HEADERS = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}


def _auth_header(installation_id: int | None = None) -> dict[str, str]:
    if settings.github_pat:
        return {"Authorization": f"Bearer {settings.github_pat}"}
    if installation_id is not None:
        from app.core.installation_token import get_installation_token
        token = get_installation_token(installation_id)
        return {"Authorization": f"Bearer {token}"}
    raise ValueError(
        "No GitHub auth configured. Set GITHUB_PAT or use App auth with an installation_id."
    )


def get_pr_diff(repo_full_name: str, pr_number: int, installation_id: int | None = None) -> str:
    headers = {**_HEADERS, **_auth_header(installation_id), "Accept": "application/vnd.github.v3.diff"}
    url = f"{GITHUB_API}/repos/{repo_full_name}/pulls/{pr_number}"
    resp = httpx.get(url, headers=headers, follow_redirects=True)
    resp.raise_for_status()
    return resp.text


def post_inline_comment(
    repo_full_name: str,
    pr_number: int,
    commit_id: str,
    path: str,
    line: int,
    body: str,
    installation_id: int | None = None,
) -> None:
    headers = {**_HEADERS, **_auth_header(installation_id)}
    url = f"{GITHUB_API}/repos/{repo_full_name}/pulls/{pr_number}/comments"
    payload = {"body": body, "commit_id": commit_id, "path": path, "line": line, "side": "RIGHT"}
    resp = httpx.post(url, headers=headers, json=payload)
    resp.raise_for_status()


def list_org_repos(org: str, installation_id: int | None = None) -> list[dict]:
    headers = {**_HEADERS, **_auth_header(installation_id)}
    url = f"{GITHUB_API}/orgs/{org}/repos"
    resp = httpx.get(url, headers=headers, params={"per_page": 100})
    resp.raise_for_status()
    return resp.json()  # type: ignore[return-value]
