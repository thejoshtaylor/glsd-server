"""Background task for detecting and handling stale GSD nodes."""
import asyncio
import logging
from datetime import timedelta

from app.utils.time import utcnow

from sqlalchemy import update

from app.database import get_session_maker
from app.models.node import Node, NodeStatus
from app.models.instance import Instance, InstanceStatus
from app.ws.frontend_manager import frontend_manager
from app.ws.manager import connection_manager

logger = logging.getLogger(__name__)

STALE_THRESHOLD_SECONDS = 90
SCAN_INTERVAL_SECONDS = 30


async def stale_node_scanner() -> None:
    """Background task that detects stale nodes and marks them + their instances.

    Runs every SCAN_INTERVAL_SECONDS (30s). A node is stale if its last_heartbeat
    is older than STALE_THRESHOLD_SECONDS (90s). Stale nodes have all their
    running/pending instances marked as errored.
    """
    logger.info(
        "Stale node scanner started (interval=%ds, threshold=%ds)",
        SCAN_INTERVAL_SECONDS,
        STALE_THRESHOLD_SECONDS,
    )
    while True:
        await asyncio.sleep(SCAN_INTERVAL_SECONDS)
        try:
            await _scan_for_stale_nodes()
        except Exception as exc:
            logger.error("Stale node scanner error: %s", exc, exc_info=True)
            # Continue scanning — don't let a single error kill the scanner


async def _scan_for_stale_nodes() -> None:
    """Scan all connected nodes and mark any stale ones."""
    now = utcnow()
    threshold = now - timedelta(seconds=STALE_THRESHOLD_SECONDS)

    for conn in connection_manager.all_connections():
        if conn.last_heartbeat and conn.last_heartbeat < threshold:
            age_seconds = (now - conn.last_heartbeat).total_seconds()
            logger.warning(
                "Node %s is stale (last heartbeat %.0fs ago, threshold %ds)",
                conn.node_id,
                age_seconds,
                STALE_THRESHOLD_SECONDS,
            )
            await _mark_node_stale(conn.node_id)


async def _mark_node_stale(node_id: str) -> None:
    """Mark a node as stale in the DB and error all its running/pending instances."""
    now = utcnow()
    async with get_session_maker()() as session:
        try:
            # Mark node as stale in DB
            node = await session.get(Node, node_id)
            if node:
                node.status = NodeStatus.stale
                node.last_seen = now

            # Bulk-error all running/pending instances
            result = await session.execute(
                update(Instance)
                .where(
                    Instance.node_id == node_id,
                    Instance.status.in_([InstanceStatus.pending, InstanceStatus.running]),
                )
                .values(
                    status=InstanceStatus.errored,
                    error="node marked stale: no heartbeat received",
                    finished_at=now,
                )
            )
            errored_count = result.rowcount

            await session.commit()

            if errored_count > 0:
                logger.warning(
                    "Errored %d instances on stale node %s", errored_count, node_id
                )

        except Exception:
            await session.rollback()
            raise

    # Push stale status to frontend connections
    await frontend_manager.broadcast_node_status(node_id, "stale")

    # Try to close the WebSocket connection
    conn = connection_manager.get(node_id)
    if conn:
        try:
            await conn.websocket.close(code=1000)
        except Exception:
            pass  # Connection may already be dead
    connection_manager.deregister(node_id)
