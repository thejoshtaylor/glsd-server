from collections.abc import AsyncGenerator
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import get_session_maker
from app.models.user import User


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

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        user_id: str | None = payload.get("sub")
        token_type: str = payload.get("type", "")
        if user_id is None or token_type != "access":
            raise credentials_exception
    except InvalidTokenError:
        raise credentials_exception
    user = await db.get(User, user_id)
    if user is None:
        raise credentials_exception
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
