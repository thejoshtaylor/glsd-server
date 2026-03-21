"""Command dispatch functions for GSD node protocol v1.2.0.

Callable by Phase 3 REST endpoints. Each function validates connectivity
and project availability before dispatching protocol-correct envelopes.
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session_maker
from app.models.instance import Instance, InstanceStatus
from app.services.node_service import user_can_access_node
from app.ws.manager import connection_manager
from app.ws.protocol import ExecutePayload, KillPayload, StatusRequestPayload

logger = logging.getLogger(__name__)


async def dispatch_execute(
    node_id: str,
    project: str,
    work_dir: str,
    prompt: str,
    user_id: str,
    db: AsyncSession,
    session_id: str | None = None,
) -> str:
    """Dispatch an execute command to a connected node.

    Validates team ownership, node connectivity, and project availability,
    creates a pending Instance record in the DB (before sending), then sends
    the execute envelope. Returns the generated instance_id.

    Raises PermissionError if the user does not have team access to the node.
    Raises ValueError if the node is not connected, the project is not
    available on the node, or the node disconnects during dispatch.
    """
    # (a) Validate team ownership — user must belong to a team that owns this node
    if not await user_can_access_node(user_id, node_id, db):
        raise PermissionError(f"User {user_id} does not have access to node {node_id}")

    # (b) Validate node is connected
    conn = connection_manager.get(node_id)
    if conn is None:
        raise ValueError(f"Node {node_id} is not connected")

    # (c) Validate project exists on node (CMD-04)
    if project not in conn.projects:
        raise ValueError(
            f"Project {project!r} not found on node {node_id}. "
            f"Available: {conn.projects}"
        )

    # (d) Generate instance_id (server-assigned)
    instance_id = str(uuid.uuid4())

    # (e) Persist pending Instance BEFORE sending to node
    async with get_session_maker()() as session:
        try:
            session.add(
                Instance(
                    instance_id=instance_id,
                    node_id=node_id,
                    project=project,
                    prompt=prompt,
                    session_id=session_id,
                    status=InstanceStatus.pending,
                )
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    # (f) Send execute envelope to node
    payload = ExecutePayload(
        instance_id=instance_id,
        project=project,
        work_dir=work_dir,
        prompt=prompt,
        session_id=session_id,
    )
    sent = await connection_manager.send_to_node(node_id, "execute", payload)
    if not sent:
        # Node disconnected between check and send — mark instance errored
        async with get_session_maker()() as session:
            try:
                instance = await session.get(Instance, instance_id)
                if instance:
                    instance.status = InstanceStatus.errored
                    instance.error = "Node disconnected before execute could be sent"
                    instance.finished_at = datetime.now(timezone.utc)
                await session.commit()
            except Exception:
                await session.rollback()
                raise
        raise ValueError(f"Node {node_id} disconnected during dispatch")

    # (g) Log and return
    logger.info(
        "Dispatched execute to node %s: instance=%s project=%s",
        node_id,
        instance_id,
        project,
    )
    return instance_id


async def dispatch_kill(node_id: str, instance_id: str, user_id: str, db: AsyncSession) -> bool:
    """Dispatch a kill command to a connected node.

    Validates team ownership and node connectivity then sends the kill envelope.
    Does NOT mark the instance status here — the server waits for the terminal
    event (instance_finished or instance_error) from the node per server-spec
    Section 4 kill behavior.

    Raises PermissionError if the user does not have team access to the node.
    Returns True if sent successfully.
    Raises ValueError if the node is not connected or the send fails.
    """
    # (a) Validate team ownership — user must belong to a team that owns this node
    if not await user_can_access_node(user_id, node_id, db):
        raise PermissionError(f"User {user_id} does not have access to node {node_id}")

    # (b) Validate node connected
    conn = connection_manager.get(node_id)
    if conn is None:
        raise ValueError(f"Node {node_id} is not connected")

    # (c) Send kill envelope
    payload = KillPayload(instance_id=instance_id)
    sent = await connection_manager.send_to_node(node_id, "kill", payload)
    if not sent:
        raise ValueError(f"Failed to send kill to node {node_id}")

    # (d) Do NOT mark instance as killed — wait for terminal event from node

    # (e) Log
    logger.info("Dispatched kill to node %s: instance=%s", node_id, instance_id)
    return True


async def dispatch_status_request(node_id: str) -> bool:
    """Dispatch a status_request command to a connected node.

    Fire-and-forget from the caller's perspective. The node responds with a
    node_register message which the WebSocket router handles. Returns True if
    sent successfully.
    Raises ValueError if the node is not connected or the send fails.
    """
    # (a) Validate node connected
    conn = connection_manager.get(node_id)
    if conn is None:
        raise ValueError(f"Node {node_id} is not connected")

    # (b) Send status_request envelope with no payload
    sent = await connection_manager.send_to_node(node_id, "status_request", None)
    if not sent:
        raise ValueError(f"Failed to send status_request to node {node_id}")

    # (c) Note: node responds with node_register; router.py handles that response

    # (d) Log
    logger.info("Dispatched status_request to node %s", node_id)
    return True
