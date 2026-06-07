from typing import Generator

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker, Session

from app.core.config import settings

# Creates synchronous SQLAlchemy engine with connection pooling
engine = create_engine(settings.database_url, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Yields a DB session; raises 503 if the database is unreachable
def get_db_session() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    except OperationalError:
        raise HTTPException(status_code=503, detail="Database unavailable")
    finally:
        db.close()
