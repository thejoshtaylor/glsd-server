"""Auth service: business logic for registration, login, token management, and WS tickets."""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, status
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
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_access_token_expire_minutes
    )
    payload = {"sub": user_id, "type": "access", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token() -> str:
    """Generate a cryptographically secure opaque 32-byte hex refresh token."""
    return secrets.token_hex(32)


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
    refresh_token_str = create_refresh_token()
    family_id = str(uuid.uuid4())
    await store_refresh_token(user_id, refresh_token_str, family_id, settings, db)

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
    user_id: str, token_str: str, family_id: str, settings: Settings, db: AsyncSession
) -> None:
    """Hash and persist a refresh token record."""
    token_hash = hashlib.sha256(token_str.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.jwt_refresh_token_expire_days
    )
    db.add(
        RefreshToken(
            token_id=str(uuid.uuid4()),
            user_id=user_id,
            token_hash=token_hash,
            family_id=family_id,
            expires_at=expires_at,
        )
    )


async def rotate_refresh_token(
    refresh_token_str: str, db: AsyncSession, settings: Settings
) -> TokenResponse:
    """Atomically rotate a refresh token: revoke old, issue new (SES-02, SES-03, SES-04)."""
    token_hash = hashlib.sha256(refresh_token_str.encode()).hexdigest()

    # Atomic revoke-and-read: UPDATE...RETURNING (SES-03)
    result = await db.execute(
        text("""
            UPDATE refresh_tokens
            SET revoked = TRUE
            WHERE token_hash = :token_hash
              AND revoked = FALSE
              AND expires_at > now()
            RETURNING user_id, family_id
        """),
        {"token_hash": token_hash},
    )
    row = result.fetchone()

    if row is not None:
        user_id, family_id = row[0], row[1]
        # Issue new token pair in the same family
        new_refresh = create_refresh_token()
        await store_refresh_token(user_id, new_refresh, family_id, settings, db)
        new_access = create_access_token(user_id, settings)
        return TokenResponse(access_token=new_access, refresh_token=new_refresh)

    # Row was None — token not found as valid. Check for reuse (SES-04).
    reuse_check = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    existing = reuse_check.scalar_one_or_none()
    if existing is not None and existing.revoked:
        # Reuse detected — revoke entire family
        await db.execute(
            text("UPDATE refresh_tokens SET revoked = TRUE WHERE family_id = :fid"),
            {"family_id": existing.family_id},
        )
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token reuse detected",
        )

    # Token simply doesn't exist or is expired
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
    )


async def revoke_refresh_token_family(refresh_token_str: str, db: AsyncSession) -> None:
    """Revoke all tokens in the same family as the provided token (logout)."""
    token_hash = hashlib.sha256(refresh_token_str.encode()).hexdigest()
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    stored = result.scalar_one_or_none()
    if stored is not None:
        await db.execute(
            text("UPDATE refresh_tokens SET revoked = TRUE WHERE family_id = :fid"),
            {"family_id": stored.family_id},
        )


async def cleanup_expired_tokens(user_id: str, db: AsyncSession) -> None:
    """Delete revoked and expired tokens for a user (keeps table lean)."""
    await db.execute(
        text("""
            DELETE FROM refresh_tokens
            WHERE user_id = :uid
              AND (revoked = TRUE OR expires_at < now())
        """),
        {"uid": user_id},
    )


# ---------------------------------------------------------------------------
# WebSocket ticket management
# ---------------------------------------------------------------------------


async def create_ws_ticket(user_id: str, db: AsyncSession) -> str:
    """Issue a single-use WS ticket valid for 30 seconds."""
    ticket_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=30)
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
