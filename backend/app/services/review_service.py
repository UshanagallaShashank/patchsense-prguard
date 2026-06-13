import uuid
from typing import Any

from supabase import Client

PAGE_SIZE = 20


def _user_repo_names(admin_client: Client, user_id: str) -> list[str]:
    """Return full_names of all repos the user owns or is a member of."""
    from typing import cast

    def rows(result: Any) -> list[dict[str, Any]]:
        data = result.data if hasattr(result, "data") else result
        return cast(list[dict[str, Any]], data) if isinstance(data, list) else []

    owned = rows(
        admin_client.table("repos").select("full_name").eq("owner_id", user_id).execute()
    )
    member_repo_ids = [
        r["repo_id"]
        for r in rows(
            admin_client.table("repo_members").select("repo_id").eq("user_id", user_id).execute()
        )
    ]
    member = rows(
        admin_client.table("repos").select("full_name").in_("id", member_repo_ids).execute()
    ) if member_repo_ids else []

    names = list({r["full_name"] for r in owned + member})
    return names


def list_reviews(client: Client, page: int, user_id: str | None = None, admin_client: Client | None = None) -> list[Any]:
    offset = (page - 1) * PAGE_SIZE
    query = client.table("reviews").select("*, findings(*)").order("created_at", desc=True)

    if user_id and admin_client:
        repo_names = _user_repo_names(admin_client, user_id)
        if not repo_names:
            return []
        query = query.in_("repo_full_name", repo_names)

    return query.range(offset, offset + PAGE_SIZE - 1).execute().data  # type: ignore[return-value]


def get_review(client: Client, review_id: uuid.UUID, user_id: str | None = None, admin_client: Client | None = None) -> Any | None:
    result = (
        client.table("reviews")
        .select("*, findings(*)")
        .eq("id", str(review_id))
        .execute()
    )
    if not result.data:
        return None
    review = result.data[0]

    if user_id and admin_client:
        allowed = _user_repo_names(admin_client, user_id)
        if review.get("repo_full_name") not in allowed:
            return None  # treat as not found — don't leak existence

    return review
