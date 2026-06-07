import uuid

from supabase import Client

PAGE_SIZE = 20


def list_reviews(client: Client, page: int) -> list[dict]:
    offset = (page - 1) * PAGE_SIZE
    result = (
        client.table("reviews")
        .select("*, findings(*)")
        .order("created_at", desc=True)
        .range(offset, offset + PAGE_SIZE - 1)
        .execute()
    )
    return result.data


def get_review(client: Client, review_id: uuid.UUID) -> dict | None:
    result = (
        client.table("reviews")
        .select("*, findings(*)")
        .eq("id", str(review_id))
        .execute()
    )
    return result.data[0] if result.data else None
