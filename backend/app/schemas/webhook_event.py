from pydantic import BaseModel


# Minimal PR payload extracted from GitHub webhook body
class PullRequestWebhookEvent(BaseModel):
    installation_id: int | None
    repo_full_name: str
    pr_number: int
    pr_title: str
    pr_branch: str
    head_sha: str
    pr_state: str  # "open" | "closed" | "merged"
    action: str
    is_draft: bool
    author_login: str


def parse_pr_event(payload: dict) -> PullRequestWebhookEvent | None:
    if "pull_request" not in payload:
        return None
    installation = payload.get("installation") or {}
    pr = payload["pull_request"]
    action = payload["action"]

    if action == "closed":
        pr_state = "merged" if pr.get("merged") else "closed"
    else:
        pr_state = "open"

    return PullRequestWebhookEvent(
        installation_id=installation.get("id"),
        repo_full_name=payload["repository"]["full_name"],
        pr_number=pr["number"],
        pr_title=pr.get("title", ""),
        pr_branch=pr.get("head", {}).get("ref", ""),
        head_sha=pr.get("head", {}).get("sha", ""),
        pr_state=pr_state,
        action=action,
        is_draft=bool(pr.get("draft", False)),
        author_login=(pr.get("user") or {}).get("login", ""),
    )
