"""Frontend WebSocket endpoint with single-use ticket authentication.

Ticket-based auth prevents the replay attack that would occur if a valid
JWT were captured from URL query params. Tickets are single-use, expire in
30 seconds, and are marked used atomically BEFORE accept().
"""
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.database import get_session_maker
from app.services.auth_service import validate_ws_ticket

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/frontend")
async def frontend_ws_endpoint(websocket: WebSocket, ticket: str) -> None:
    """Frontend WebSocket endpoint with single-use ticket authentication.

    Ticket is passed as query parameter: /ws/frontend?ticket=<uuid>
    Ticket must be valid, unexpired, and unused. Marked used BEFORE accept().

    CRITICAL: validate_ws_ticket marks the ticket as used atomically
    (UPDATE...WHERE used=False RETURNING). This MUST happen BEFORE
    websocket.accept(). If accept() happened first and the DB commit failed,
    the ticket could be replayed on reconnect.
    """
    # Step 1: Validate and consume ticket BEFORE accepting the WebSocket
    async with get_session_maker()() as session:
        try:
            user_id = await validate_ws_ticket(ticket, session)
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    if user_id is None:
        # Invalid, expired, or already-used ticket — reject before accepting
        await websocket.close(code=1008)  # Policy Violation
        return

    # Step 2: Accept the WebSocket connection now that auth is confirmed
    await websocket.accept()
    logger.info("Frontend WebSocket connected: user=%s", user_id)

    # Step 3: Connection loop — placeholder for Phase 4 streaming
    # Phase 4 will add: subscription to instance streams, event fan-out
    try:
        while True:
            # Receive messages from frontend (e.g., subscribe to instance)
            data = await websocket.receive_text()
            # Phase 4 will implement message handling here
            # For now, acknowledge receipt
            await websocket.send_text('{"type": "ack"}')
    except WebSocketDisconnect:
        logger.info("Frontend WebSocket disconnected: user=%s", user_id)
    except Exception as e:
        logger.error("Frontend WebSocket error: user=%s error=%s", user_id, str(e))
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.close(code=1011)  # Internal Error
