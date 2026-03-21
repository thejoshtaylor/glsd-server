from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session_maker


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an AsyncSession with automatic commit/rollback.

    CRITICAL: Do NOT inject DbSession into WebSocket handlers for the connection
    lifetime. Sessions must be acquired and released per discrete operation within
    long-lived WebSocket loops — not held for the connection lifetime.
    """
    async with get_session_maker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


DbSession = Annotated[AsyncSession, Depends(get_db)]
