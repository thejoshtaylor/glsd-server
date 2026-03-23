"""Frontend WebSocket endpoint with single-use ticket authentication.

Ticket-based auth prevents the replay attack that would occur if a valid
JWT were captured from URL query params. Tickets are single-use, expire in
30 seconds, and are marked used atomically BEFORE accept().
"""
import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.database import get_session_maker
from app.services.auth_service import validate_ws_ticket
from app.services.node_service import user_can_access_instance
from app.ws.frontend_manager import FrontendConnection, frontend_manager
from app.ws.manager import connection_manager

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

    After auth, a per-connection asyncio.Queue is used for safe fan-out.
    A dedicated writer coroutine drains the queue and sends to the WebSocket,
    ensuring the reader loop is never blocked by slow sends.
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

    # Step 3: Create connection object and register it
    conn = FrontendConnection(user_id=user_id, websocket=websocket)
    frontend_manager.register(conn)

    # Step 4: Start the writer coroutine — drains conn.queue and sends to WebSocket
    async def writer() -> None:
        try:
            while True:
                msg = await conn.queue.get()
                try:
                    await websocket.send_text(json.dumps(msg))
                except Exception as exc:
                    logger.debug(
                        "Frontend writer send failed: user=%s error=%s", user_id, exc
                    )
                    break
        except asyncio.CancelledError:
            pass

    writer_task = asyncio.create_task(writer())

    # Step 5: Reader loop — handles subscribe/unsubscribe messages from frontend
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("Frontend sent invalid JSON: user=%s", user_id)
                continue

            msg_type = msg.get("type")

            if msg_type == "subscribe":
                instance_id = msg.get("instance_id")
                if not instance_id:
                    continue

                # Validate team-based access before subscribing
                async with get_session_maker()() as session:
                    has_access = await user_can_access_instance(user_id, instance_id, session)

                if not has_access:
                    logger.warning(
                        "Frontend subscribe denied: user=%s instance=%s (no team access)",
                        user_id,
                        instance_id,
                    )
                    try:
                        conn.queue.put_nowait(
                            {
                                "type": "error",
                                "detail": f"Access denied for instance {instance_id}",
                            }
                        )
                    except asyncio.QueueFull:
                        pass
                    continue

                frontend_manager.subscribe(conn, instance_id)
                logger.info(
                    "Frontend subscribed: user=%s instance=%s", user_id, instance_id
                )

                # Replay buffered in-memory stream events for this instance
                buffered = connection_manager.get_stream_events(instance_id)
                for event in buffered:
                    try:
                        conn.queue.put_nowait(
                            {
                                "type": "stream_event",
                                "instance_id": instance_id,
                                "data": event,
                            }
                        )
                    except asyncio.QueueFull:
                        logger.warning(
                            "Queue full during replay: user=%s instance=%s — truncating",
                            user_id,
                            instance_id,
                        )
                        break

            elif msg_type == "unsubscribe":
                instance_id = msg.get("instance_id")
                if instance_id:
                    frontend_manager.unsubscribe(conn, instance_id)
                    logger.info(
                        "Frontend unsubscribed: user=%s instance=%s", user_id, instance_id
                    )

            else:
                logger.debug(
                    "Frontend sent unknown message type: user=%s type=%s", user_id, msg_type
                )

    except WebSocketDisconnect:
        logger.info("Frontend WebSocket disconnected: user=%s", user_id)
    except Exception as exc:
        logger.error("Frontend WebSocket error: user=%s error=%s", user_id, str(exc))
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.close(code=1011)  # Internal Error
    finally:
        writer_task.cancel()
        frontend_manager.deregister(conn)
