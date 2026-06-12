import uuid
from datetime import datetime

from pydantic import BaseModel


# Response schema for a single finding
class FindingOut(BaseModel):
    id: uuid.UUID
    agent: str
    severity: str
    file_path: str
    line_number: int | None
    message: str
    suggestion: str | None
    fix_diff: str | None = None

    model_config = {"from_attributes": True}


# Response schema for a review with its findings
class ReviewOut(BaseModel):
    id: uuid.UUID
    repo_full_name: str
    pr_number: int
    pr_title: str | None = None
    head_branch: str | None = None
    author_login: str | None = None
    pr_state: str | None = None  # "open" | "closed" | "merged"
    status: str
    created_at: datetime
    completed_at: datetime | None
    findings: list[FindingOut] = []

    model_config = {"from_attributes": True}
