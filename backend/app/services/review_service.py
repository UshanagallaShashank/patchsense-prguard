import uuid
from typing import Any

from supabase import Client

PAGE_SIZE = 20


def _rows(result: Any) -> list[dict[str, Any]]:
    from typing import cast
    data = result.data if hasattr(result, "data") else result
    return cast(list[dict[str, Any]], data) if isinstance(data, list) else []


def _user_repo_active_map(admin_client: Client, user_id: str) -> dict[str, bool]:
    """Return {full_name: active} for repos scoped strictly to this user.

    Queries by owner_id (not by full_name) so repos owned by other users with
    the same full_name can never contaminate the result.
    """
    owned = _rows(
        admin_client.table("repos")
        .select("full_name,active")
        .eq("owner_id", user_id)
        .execute()
    )
    member_repo_ids = [
        r["repo_id"]
        for r in _rows(
            admin_client.table("repo_members")
            .select("repo_id")
            .eq("user_id", user_id)
            .execute()
        )
    ]
    member = (
        _rows(
            admin_client.table("repos")
            .select("full_name,active")
            .in_("id", member_repo_ids)
            .execute()
        )
        if member_repo_ids
        else []
    )

    result: dict[str, bool] = {}
    for r in owned + member:
        fn = r["full_name"]
        if fn not in result:
            # NULL active means never explicitly paused — treat as active.
            result[fn] = r.get("active") is not False
    return result


def _user_repo_names(admin_client: Client, user_id: str) -> list[str]:
    """Return full_names of all repos the user owns or is a member of."""
    return list(_user_repo_active_map(admin_client, user_id).keys())


def list_reviews(
    client: Client,
    page: int,
    user_id: str | None = None,
    admin_client: Client | None = None,
) -> list[Any]:
    offset = (page - 1) * PAGE_SIZE
    query = client.table("reviews").select("*, findings(*)").order("created_at", desc=True)

    active_map: dict[str, bool] = {}

    if user_id and admin_client:
        active_map = _user_repo_active_map(admin_client, user_id)
        repo_names = list(active_map.keys())
        if not repo_names:
            return []
        query = query.in_("repo_full_name", repo_names)

    reviews = query.range(offset, offset + PAGE_SIZE - 1).execute().data or []

    for r in reviews:
        # Default True: if a review exists for a repo not in the map,
        # assume active rather than incorrectly blocking the user.
        r["repo_active"] = active_map.get(r["repo_full_name"], True)

    return reviews  # type: ignore[return-value]


def get_review(
    client: Client,
    review_id: uuid.UUID,
    user_id: str | None = None,
    admin_client: Client | None = None,
) -> Any | None:
    result = (
        client.table("reviews")
        .select("*, findings(*)")
        .eq("id", str(review_id))
        .execute()
    )
    if not result.data:
        return None
    review = result.data[0]

    active_map: dict[str, bool] = {}
    if user_id and admin_client:
        active_map = _user_repo_active_map(admin_client, user_id)
        if review.get("repo_full_name") not in active_map:
            return None  # not in user's accessible repos — treat as not found

    review["repo_active"] = active_map.get(review.get("repo_full_name", ""), True)
    return review
