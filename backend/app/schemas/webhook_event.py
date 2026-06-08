from pydantic import BaseModel


# Minimal PR payload extracted from GitHub webhook body
class PullRequestWebhookEvent(BaseModel):
    installation_id: int | None
    repo_full_name: str
    pr_number: int
    action: str


# Parses raw GitHub webhook JSON into a typed event
def parse_pr_event(payload: dict) -> PullRequestWebhookEvent | None:
    if "pull_request" not in payload:
        return None
    installation = payload.get("installation") or {}
    return PullRequestWebhookEvent(
        installation_id=installation.get("id"),
        repo_full_name=payload["repository"]["full_name"],
        pr_number=payload["pull_request"]["number"],
        action=payload["action"],
    )
