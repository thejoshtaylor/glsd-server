"""Auth router: REST endpoints for registration, login, refresh, logout, and WS ticket."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.config import Settings, get_settings
from app.dependencies import CurrentUser, DbSession
from app.schemas.auth import RefreshRequest, RegisterRequest, TokenResponse, WsTicketResponse
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    body: RegisterRequest,
    db: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenResponse:
    """Register a new user and return JWT tokens. Creates a personal team automatically."""
    return await auth_service.register_user(body.email, body.password, db, settings)


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenResponse:
    """Authenticate with email + password and return JWT tokens.

    Uses OAuth2PasswordRequestForm for OpenAPI compatibility.
    The `username` field receives the email value (per OAuth2 spec).
    """
    user = await auth_service.authenticate_user(form_data.username, form_data.password, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    await auth_service.cleanup_expired_tokens(user.user_id, db)
    access_token = auth_service.create_access_token(user.user_id, settings)
    refresh_token = auth_service.create_refresh_token()
    family_id = str(uuid.uuid4())
    await auth_service.store_refresh_token(user.user_id, refresh_token, family_id, settings, db)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    db: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenResponse:
    """Issue new access and refresh tokens via atomic rotation."""
    return await auth_service.rotate_refresh_token(body.refresh_token, db, settings)


@router.post("/logout")
async def logout(
    body: RefreshRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> dict[str, str]:
    """Revoke the entire token family (logout). Requires a valid access token."""
    await auth_service.revoke_refresh_token_family(body.refresh_token, db)
    return {"detail": "Logged out"}


@router.post("/ws-ticket", response_model=WsTicketResponse)
async def ws_ticket(
    current_user: CurrentUser,
    db: DbSession,
) -> WsTicketResponse:
    """Issue a single-use WebSocket ticket valid for 30 seconds."""
    ticket_id = await auth_service.create_ws_ticket(current_user.user_id, db)
    return WsTicketResponse(ticket=ticket_id)


@router.get("/me")
async def me(current_user: CurrentUser) -> dict[str, str]:
    """Return the current user's identity. Used for token validation checks."""
    return {"user_id": current_user.user_id, "email": current_user.email}
