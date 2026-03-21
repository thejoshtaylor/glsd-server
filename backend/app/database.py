from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    pass


# Lazy initialization — do NOT create engine at module import time.
# Importing this module at test/lint time would trigger Settings validation
# and fail if no .env exists. Engine is created on first call instead.
_engine = None
_async_session_maker = None


def get_engine():
    """Return the async engine, creating it on first call."""
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.database_url,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_pre_ping=True,  # Detect stale connections before use
        )
    return _engine


def get_session_maker() -> async_sessionmaker[AsyncSession]:
    """Return the async session maker, creating it on first call."""
    global _async_session_maker
    if _async_session_maker is None:
        _async_session_maker = async_sessionmaker(
            get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,  # Prevent detached-instance errors after commit
        )
    return _async_session_maker
