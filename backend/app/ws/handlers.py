"""Node-to-server message handlers for the GSD wire protocol v1.2.0.

Each handler acquires its own short-lived DB session via
``async with get_session_maker()() as session:`` — sessions are NEVER held
across WebSocket awaits.
"""
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import func, select, update

from app.database import get_session_maker
from app.models.instance import Instance, InstanceStatus
from app.models.node import Node, NodeStatus
from app.models.stream_event import StreamEvent as StreamEventModel
from app.services.audit_service import write_audit_log
from app.ws.frontend_manager import frontend_manager
from app.ws.manager import NodeConnection, connection_manager
from app.ws.protocol import (
    AckPayload,
    InstanceErrorPayload,
    InstanceFinishedPayload,
    InstanceStartedPayload,
    InstanceSummary,
    NodeDisconnectPayload,
    NodeRegisterPayload,
    StreamEventPayload,
)

logger = logging.getLogger(__name__)


async def handle_node_register(payload: NodeRegisterPayload, conn: NodeConnection) -> None:
    """Handle node_register: upsert node record and reconcile instances.

    Acquires the per-node asyncio.Lock to prevent reconciliation races
    when a node reconnects rapidly.
    """
    async with connection_manager.get_lock(payload.node_id):
        # If another connection exists for this node_id, close it gracefully.
        existing = connection_manager.get(payload.node_id)
        if existing is not None and existing.websocket is not conn.websocket:
            try:
                await existing.websocket.close()
            except Exception:
                pass  # Already closed is fine
            connection_manager.deregister(payload.node_id)

        # Register the new connection.
        connection_manager.register(conn)

        now = datetime.now(timezone.utc)

        is_new = False
        async with get_session_maker()() as session:
            try:
                node = await session.get(Node, payload.node_id)
                if node is None:
                    # New node — log warning per server-spec security section.
                    logger.warning("New node_id connected: %s", payload.node_id)
                    is_new = True
                    node = Node(
                        node_id=payload.node_id,
                        platform=payload.platform,
                        version=payload.version,
                        projects=payload.projects,
                        status=NodeStatus.connected,
                        first_seen=now,
                        connected_at=now,
                        last_heartbeat=now,
                        last_seen=now,
                    )
                    session.add(node)
                else:
                    node.platform = payload.platform
                    node.version = payload.version
                    node.projects = payload.projects
                    node.status = NodeStatus.connected
                    node.connected_at = now
                    node.last_heartbeat = now
                    node.last_seen = now

                await reconcile_instances(payload.node_id, payload.running_instances, session)
                await session.commit()
            except Exception:
                await session.rollback()
                raise

        # Push status changes to frontend connections
        if is_new:
            await frontend_manager.broadcast_new_node_alert(payload.node_id)
        await frontend_manager.broadcast_node_status(payload.node_id, "connected")


async def reconcile_instances(
    node_id: str, node_running: list[InstanceSummary], session
) -> None:
    """Reconcile server-tracked instances against node's reported running_instances.

    Implements server-spec.md Section 6:
    - Lost instances (server has, node doesn't): mark errored
    - New instances (node has, server doesn't): add as running
    - Matched instances (both have): update session_id if changed, confirm running

    Does NOT commit — caller is responsible for committing.
    """
    node_ids = {s.instance_id for s in node_running}

    result = await session.execute(
        select(Instance).where(
            Instance.node_id == node_id,
            Instance.status.in_([InstanceStatus.pending, InstanceStatus.running]),
        )
    )
    server_instances = {inst.instance_id: inst for inst in result.scalars()}
    server_ids = set(server_instances.keys())

    now = datetime.now(timezone.utc)

    # Lost instances — in server but NOT in node's list (e.g., node crashed).
    for lost_id in server_ids - node_ids:
        inst = server_instances[lost_id]
        inst.status = InstanceStatus.errored
        inst.error = "lost: node reconnected without this instance"
        inst.finished_at = now
        logger.info("Reconciliation: instance %s marked as lost for node %s", lost_id, node_id)

    # New instances — in node's list but NOT in server (e.g., server restarted).
    for summary in node_running:
        if summary.instance_id not in server_ids:
            new_inst = Instance(
                instance_id=summary.instance_id,
                node_id=node_id,
                project=summary.project,
                session_id=summary.session_id,
                status=InstanceStatus.running,
            )
            session.add(new_inst)
            logger.info(
                "Reconciliation: added new instance %s for node %s (server restart case)",
                summary.instance_id,
                node_id,
            )

    # Matched instances — in both; update session_id and confirm running.
    for summary in node_running:
        if summary.instance_id in server_instances:
            inst = server_instances[summary.instance_id]
            if summary.session_id is not None and inst.session_id != summary.session_id:
                inst.session_id = summary.session_id
            inst.status = InstanceStatus.running


async def handle_ack(payload: AckPayload, envelope_id: str) -> None:
    """Handle ack: mark instance as running, correlate via envelope ID.

    The envelope_id matches the execute command's ID — logged for correlation
    but not persisted (per protocol-spec Section 3.1.2).
    """
    async with get_session_maker()() as session:
        try:
            instance = await session.get(Instance, payload.instance_id)
            if instance is not None and instance.status == InstanceStatus.pending:
                instance.status = InstanceStatus.running
            await session.commit()
        except Exception:
            await session.rollback()
            raise
    await frontend_manager.broadcast_instance_status(payload.instance_id, "running")
    logger.info("ACK received for instance %s (envelope %s)", payload.instance_id, envelope_id)


async def handle_stream_event(payload: StreamEventPayload) -> None:
    """Handle stream_event: parse double-encoded JSON, persist to DB, buffer in-memory."""
    # Double-encoded JSON — data is a JSON string that itself contains JSON.
    parsed_data = json.loads(payload.data)

    async with get_session_maker()() as session:
        try:
            # Determine sequence number by counting existing events for this instance.
            result = await session.execute(
                select(func.count())
                .select_from(StreamEventModel)
                .where(StreamEventModel.instance_id == payload.instance_id)
            )
            seq = result.scalar() or 0

            session.add(
                StreamEventModel(
                    instance_id=payload.instance_id,
                    sequence_num=seq,
                    data=parsed_data,
                    created_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    # Buffer in-memory for real-time fan-out to frontend.
    connection_manager.append_stream_event(payload.instance_id, parsed_data)

    # Fan out to subscribed frontend connections.
    await frontend_manager.fan_out_stream_event(payload.instance_id, parsed_data)


async def handle_instance_started(payload: InstanceStartedPayload) -> None:
    """Handle instance_started: capture session_id and confirm running status."""
    async with get_session_maker()() as session:
        try:
            instance = await session.get(Instance, payload.instance_id)
            if instance is not None:
                instance.session_id = payload.session_id
                instance.started_at = datetime.now(timezone.utc)
                # Set running in case ACK was missed (belt-and-suspenders).
                instance.status = InstanceStatus.running
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def handle_instance_finished(payload: InstanceFinishedPayload) -> None:
    """Handle instance_finished: mark instance finished with exit_code."""
    async with get_session_maker()() as session:
        try:
            instance = await session.get(Instance, payload.instance_id)
            if instance is not None:
                instance.status = InstanceStatus.finished
                instance.exit_code = payload.exit_code
                instance.finished_at = datetime.now(timezone.utc)
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    # Clear in-memory stream buffer — data is persisted to DB.
    connection_manager.clear_stream_events(payload.instance_id)

    await frontend_manager.broadcast_instance_status(payload.instance_id, "finished")
    await write_audit_log(
        event_type="instance_finished",
        node_id=None,  # node_id not in payload; instance_id sufficient for correlation
        instance_id=payload.instance_id,
        details={"exit_code": payload.exit_code},
    )


async def handle_instance_error(payload: InstanceErrorPayload) -> None:
    """Handle instance_error: mark instance errored.

    Works from BOTH pending AND running status — rate-limit case sends
    instance_error directly from pending without ACK or instance_started.
    """
    async with get_session_maker()() as session:
        try:
            instance = await session.get(Instance, payload.instance_id)
            if instance is not None:
                # Must work from both pending (rate-limit case) and running.
                instance.status = InstanceStatus.errored
                instance.error = payload.error
                instance.finished_at = datetime.now(timezone.utc)
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    # Clear in-memory stream buffer.
    connection_manager.clear_stream_events(payload.instance_id)

    await frontend_manager.broadcast_instance_status(payload.instance_id, "errored")
    await write_audit_log(
        event_type="instance_error",
        instance_id=payload.instance_id,
        details={"error": payload.error},
    )


async def handle_node_disconnect(payload: NodeDisconnectPayload, node_id: str) -> None:
    """Handle node_disconnect: graceful shutdown — mark node disconnected."""
    async with get_session_maker()() as session:
        try:
            node = await session.get(Node, node_id)
            if node is not None:
                node.status = NodeStatus.disconnected
                node.last_seen = datetime.now(timezone.utc)
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    connection_manager.deregister(node_id)
    await frontend_manager.broadcast_node_status(node_id, "disconnected")
    logger.info("Node %s disconnected gracefully: %s", node_id, payload.reason)


async def handle_unexpected_disconnect(node_id: str) -> None:
    """Handle unexpected WebSocket disconnect: mark node disconnected and bulk-error instances.

    Uses a single UPDATE statement to atomically error all running/pending
    instances — avoids N individual session.get() calls.
    """
    async with get_session_maker()() as session:
        try:
            node = await session.get(Node, node_id)
            if node is not None:
                node.status = NodeStatus.disconnected
                node.last_seen = datetime.now(timezone.utc)

            # Bulk-error all running/pending instances in one statement.
            await session.execute(
                update(Instance)
                .where(
                    Instance.node_id == node_id,
                    Instance.status.in_([InstanceStatus.pending, InstanceStatus.running]),
                )
                .values(
                    status=InstanceStatus.errored,
                    error="node disconnected unexpectedly",
                    finished_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    connection_manager.deregister(node_id)
    await frontend_manager.broadcast_node_status(node_id, "disconnected")
    logger.info("Node %s disconnected unexpectedly, errored all running instances", node_id)
