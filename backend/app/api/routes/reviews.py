import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.supabase_client import get_supabase
from app.schemas.review_schema import ReviewOut
from app.services.review_service import get_review, list_reviews

router = APIRouter(prefix="/api")


@router.get("/reviews", response_model=list[ReviewOut])
def get_reviews(page: int = 1, client: Client = Depends(get_supabase)) -> Any:
    return list_reviews(client, page)


@router.get("/reviews/{review_id}", response_model=ReviewOut)
def get_review_by_id(review_id: uuid.UUID, client: Client = Depends(get_supabase)) -> Any:
    review = get_review(client, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    return review
