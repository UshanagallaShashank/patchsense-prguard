import uuid

from sqlalchemy.orm import Session, joinedload

from app.models.review import Review

PAGE_SIZE = 20


# Returns a page of reviews ordered by most recent first
def list_reviews(db: Session, page: int) -> list[Review]:
    offset = (page - 1) * PAGE_SIZE
    return (
        db.query(Review)
        .options(joinedload(Review.findings))
        .order_by(Review.created_at.desc())
        .offset(offset)
        .limit(PAGE_SIZE)
        .all()
    )


# Returns a single review by id with its findings, or None if not found
def get_review(db: Session, review_id: uuid.UUID) -> Review | None:
    return (
        db.query(Review)
        .options(joinedload(Review.findings))
        .filter(Review.id == review_id)
        .first()
    )
