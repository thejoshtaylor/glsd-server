"""Auth service: business logic for registration, login, token management, and WS tickets."""

import hashlib
import uuid
from datetime import datetime, timedelta

from app.utils.time import utcnow

import jwt
from fastapi import HTTPException, status
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.refresh_token import RefreshToken
from app.models.team import Team, TeamMember
from app.models.user import User
from app.models.ws_ticket import WsTicket
from app.schemas.auth import TokenResponse

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

password_hasher = PasswordHash.recommended()


def hash_password(plain: str) -> str:
    return password_hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return password_hasher.verify(plain, hashed)


# ---------------------------------------------------------------------------
# JWT token creation
# ---------------------------------------------------------------------------


def create_access_token(user_id: str, settings: Settings) -> str:
    expire = utcnow() + timedelta(
        minutes=settings.jwt_access_token_expire_minutes
    )
    payload = {"sub": user_id, "type": "access", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str, settings: Settings) -> str:
    expire = utcnow() + timedelta(
        days=settings.jwt_refresh_token_expire_days
    )
    payload = {"sub": user_id, "type": "refresh", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


# ---------------------------------------------------------------------------
# User registration
# ---------------------------------------------------------------------------


async def register_user(
    email: str, password: str, db: AsyncSession, settings: Settings
) -> TokenResponse:
    """Register a new user, create personal team, and return tokens.

    User + Team + TeamMember are created in a single atomic transaction (TEAM-01).
    """
    # Check for existing user
    result = await db.execute(select(User).where(User.email == email))
    existing = result.scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    hashed = hash_password(password)
    user_id = str(uuid.uuid4())
    team_id = str(uuid.uuid4())

    # Create user, personal team, and team membership atomically
    db.add(User(user_id=user_id, email=email, hashed_password=hashed))
    db.add(Team(team_id=team_id, name=f"{email}'s Team", owner_id=user_id))
    db.add(TeamMember(team_id=team_id, user_id=user_id, role="owner"))
    await db.flush()  # Write all three atomically; session commit happens in dependency

    # Issue tokens
    access_token = create_access_token(user_id, settings)
    refresh_token_str = create_refresh_token(user_id, settings)
    await store_refresh_token(user_id, refresh_token_str, settings, db)

    return TokenResponse(access_token=access_token, refresh_token=refresh_token_str)


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


async def authenticate_user(
    email: str, password: str, db: AsyncSession
) -> User | None:
    """Return the User if credentials are valid, otherwise None."""
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


# ---------------------------------------------------------------------------
# Refresh token management
# ---------------------------------------------------------------------------


async def store_refresh_token(
    user_id: str, token_str: str, settings: Settings, db: AsyncSession
) -> None:
    """Hash and persist a refresh token record."""
    token_hash = hashlib.sha256(token_str.encode()).hexdigest()
    expires_at = utcnow() + timedelta(
        days=settings.jwt_refresh_token_expire_days
    )
    db.add(
        RefreshToken(
            token_id=str(uuid.uuid4()),
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
    )


async def refresh_access_token(
    refresh_token_str: str, db: AsyncSession, settings: Settings
) -> TokenResponse:
    """Validate a refresh token and issue a new access token.

    Returns the same refresh token (no rotation) — rotation is a v2 enhancement.
    """
    try:
        payload = jwt.decode(
            refresh_token_str,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    token_type = payload.get("type", "")
    user_id: str | None = payload.get("sub")
    if token_type != "refresh" or user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    token_hash = hashlib.sha256(refresh_token_str.encode()).hexdigest()
    now = utcnow()

    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.user_id == user_id,
            RefreshToken.revoked == False,  # noqa: E712
        )
    )
    stored = result.scalar_one_or_none()

    if stored is None or stored.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    new_access_token = create_access_token(user_id, settings)
    return TokenResponse(access_token=new_access_token, refresh_token=refresh_token_str)


async def revoke_refresh_token(refresh_token_str: str, db: AsyncSession) -> None:
    """Mark a refresh token as revoked (logout)."""
    token_hash = hashlib.sha256(refresh_token_str.encode()).hexdigest()
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    stored = result.scalar_one_or_none()
    if stored is not None:
        stored.revoked = True


# ---------------------------------------------------------------------------
# WebSocket ticket management
# ---------------------------------------------------------------------------


async def create_ws_ticket(user_id: str, db: AsyncSession) -> str:
    """Issue a single-use WS ticket valid for 30 seconds."""
    ticket_id = str(uuid.uuid4())
    expires_at = utcnow() + timedelta(seconds=30)
    db.add(
        WsTicket(
            ticket_id=ticket_id,
            user_id=user_id,
            expires_at=expires_at,
        )
    )
    return ticket_id


async def validate_ws_ticket(ticket_id: str, db: AsyncSession) -> str | None:
    """Atomically consume a WS ticket and return the user_id, or None if invalid.

    Uses UPDATE...WHERE...RETURNING to prevent replay races (atomic consumption).
    """
    result = await db.execute(
        text(
            """
            UPDATE ws_tickets
            SET used = TRUE
            WHERE ticket_id = :ticket_id
              AND used = FALSE
              AND expires_at > now()
            RETURNING user_id
            """
        ),
        {"ticket_id": ticket_id},
    )
    row = result.fetchone()
    if row is None:
        return None
    return row[0]
