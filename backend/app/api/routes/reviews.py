import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db_session
from app.schemas.review_schema import ReviewOut
from app.services.review_service import get_review, list_reviews

router = APIRouter(prefix="/api")


# Returns a paginated list of reviews ordered by most recent
@router.get("/reviews", response_model=list[ReviewOut])
def get_reviews(page: int = 1, db: Session = Depends(get_db_session)) -> list[ReviewOut]:
    return list_reviews(db, page)


# Returns a single review with its findings by id
@router.get("/reviews/{review_id}", response_model=ReviewOut)
def get_review_by_id(review_id: uuid.UUID, db: Session = Depends(get_db_session)) -> ReviewOut:
    review = get_review(db, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    return review
