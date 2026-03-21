"""FastAPI WebSocket endpoint for GSD node connections (/ws/node).

Authentication occurs BEFORE websocket.accept() — an invalid token
sends a WebSocket close frame (1008 Policy Violation) before upgrading.

Message dispatch loop updates last_heartbeat on every received frame
(resolves Research open question: Starlette has no ping callback, so any
message resets the stale timer). The node sends WebSocket-level pings every
30s, which Starlette handles automatically at the protocol level.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.config import get_settings
from app.ws import handlers
from app.ws.manager import NodeConnection, connection_manager
from app.ws.protocol import (
    AckPayload,
    Envelope,
    InstanceErrorPayload,
    InstanceFinishedPayload,
    InstanceStartedPayload,
    MSG_TYPES,
    NodeDisconnectPayload,
    NodeRegisterPayload,
    StreamEventPayload,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/node")
async def node_ws_endpoint(websocket: WebSocket) -> None:
    """WebSocket endpoint for GSD node connections.

    Step 1: Validate Bearer token BEFORE accept (pre-upgrade auth).
    Step 2: Expect node_register as first frame.
    Step 3: Handle node_register and register connection.
    Step 4: Message dispatch loop until disconnect.
    """
    # --- Step 1: Pre-accept Bearer token validation ---
    settings = get_settings()
    auth_header = websocket.headers.get("authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()
    if not token or token not in settings.valid_tokens:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    # --- Step 2: Expect node_register as first frame ---
    try:
        raw = await websocket.receive_text()
    except WebSocketDisconnect:
        return

    try:
        envelope = Envelope.model_validate_json(raw)
    except Exception as exc:
        logger.warning("Invalid first frame (not valid Envelope): %s", exc)
        await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
        return

    if envelope.type != "node_register":
        logger.warning("First frame was %s, expected node_register", envelope.type)
        await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
        return

    # --- Step 3: Parse and handle node_register ---
    try:
        register_payload = NodeRegisterPayload.model_validate(envelope.payload or {})
    except Exception as exc:
        logger.error("Invalid node_register payload: %s", exc)
        await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
        return

    now = datetime.now(timezone.utc)
    conn = NodeConnection(
        node_id=register_payload.node_id,
        websocket=websocket,
        platform=register_payload.platform,
        version=register_payload.version,
        projects=register_payload.projects,
        connected_at=now,
        last_heartbeat=now,
    )
    await handlers.handle_node_register(register_payload, conn)
    node_id = register_payload.node_id
    logger.info(
        "Node %s registered (platform=%s, version=%s, projects=%s)",
        node_id,
        register_payload.platform,
        register_payload.version,
        register_payload.projects,
    )

    # --- Step 4: Message dispatch loop ---
    try:
        while True:
            raw = await websocket.receive_text()

            # Update heartbeat on ANY received message (Starlette has no ping callback;
            # this approximates heartbeat tracking via application-level messages).
            now = datetime.now(timezone.utc)
            connection_manager.update_heartbeat(node_id, now)

            try:
                envelope = Envelope.model_validate_json(raw)
            except Exception as exc:
                logger.warning("Node %s: malformed envelope: %s", node_id, exc)
                continue

            try:
                await dispatch_message(envelope, node_id)
            except Exception as exc:
                logger.error(
                    "Node %s: handler error for %s: %s", node_id, envelope.type, exc
                )
    except WebSocketDisconnect:
        logger.info("Node %s: WebSocket disconnected", node_id)
        await handlers.handle_unexpected_disconnect(node_id)
    except Exception as exc:
        logger.error("Node %s: unexpected error in message loop: %s", node_id, exc)
        await handlers.handle_unexpected_disconnect(node_id)


async def dispatch_message(envelope: Envelope, node_id: str) -> None:
    """Route an inbound envelope to the correct handler.

    Logs unknown types as warnings. Server-to-node types (execute, kill,
    status_request) arriving from a node are logged as suspicious.
    """
    msg_type = envelope.type
    payload_class = MSG_TYPES.get(msg_type)
    if payload_class is None:
        logger.warning("Node %s: unknown message type: %s", node_id, msg_type)
        return

    # Parse payload using the registered Pydantic model.
    payload = payload_class.model_validate(envelope.payload or {})

    if msg_type == "node_register":
        # node_register received after initial connect = response to status_request.
        # Re-use the existing connection object from the registry.
        existing = connection_manager.get(node_id)
        if existing is not None:
            await handlers.handle_node_register(payload, existing)
    elif msg_type == "ack":
        await handlers.handle_ack(payload, envelope.id)
    elif msg_type == "stream_event":
        await handlers.handle_stream_event(payload)
    elif msg_type == "instance_started":
        await handlers.handle_instance_started(payload)
    elif msg_type == "instance_finished":
        await handlers.handle_instance_finished(payload)
    elif msg_type == "instance_error":
        await handlers.handle_instance_error(payload)
    elif msg_type == "node_disconnect":
        await handlers.handle_node_disconnect(payload, node_id)
    else:
        # Server-to-node types (execute, kill, status_request) should never
        # arrive from a node — log as suspicious but do not close connection.
        logger.warning(
            "Node %s: received server-to-node type from node: %s", node_id, msg_type
        )
