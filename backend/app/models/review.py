import uuid
from datetime import datetime

from sqlalchemy import BigInteger, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# Tracks a single PR review job triggered by a webhook event
class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    installation_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("installations.id"))
    repo_full_name: Mapped[str] = mapped_column(String, nullable=False)
    pr_number: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
