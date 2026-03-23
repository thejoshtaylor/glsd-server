"""Frontend WebSocket connection manager with per-connection asyncio.Queue fan-out.

Uses the asyncio.Queue pattern for safe, non-blocking fan-out to multiple
concurrent frontend WebSocket connections. Each connection gets its own queue
with backpressure protection (maxsize=500).
"""
import asyncio
import logging
from dataclasses import dataclass, field

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class FrontendConnection:
    """Represents a single authenticated frontend WebSocket connection."""

    user_id: str
    websocket: WebSocket
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=500))
    subscriptions: set[str] = field(default_factory=set)


class FrontendConnectionManager:
    """Manages frontend WebSocket connections with per-connection asyncio.Queue fan-out.

    A single user may have multiple tabs open, so connections are stored as
    user_id -> list[FrontendConnection].
    """

    def __init__(self) -> None:
        self._connections: dict[str, list[FrontendConnection]] = {}

    def register(self, conn: FrontendConnection) -> None:
        """Add a FrontendConnection to the registry."""
        if conn.user_id not in self._connections:
            self._connections[conn.user_id] = []
        self._connections[conn.user_id].append(conn)
        logger.debug("Frontend connection registered: user=%s", conn.user_id)

    def deregister(self, conn: FrontendConnection) -> None:
        """Remove a FrontendConnection from the registry, cleaning up empty lists."""
        user_conns = self._connections.get(conn.user_id)
        if user_conns is not None:
            try:
                user_conns.remove(conn)
            except ValueError:
                pass  # Already removed
            if not user_conns:
                del self._connections[conn.user_id]
        logger.debug("Frontend connection deregistered: user=%s", conn.user_id)

    def subscribe(self, conn: FrontendConnection, instance_id: str) -> None:
        """Subscribe a connection to a specific instance's stream events."""
        conn.subscriptions.add(instance_id)
        logger.debug(
            "Frontend connection subscribed: user=%s instance=%s", conn.user_id, instance_id
        )

    def unsubscribe(self, conn: FrontendConnection, instance_id: str) -> None:
        """Unsubscribe a connection from a specific instance's stream events."""
        conn.subscriptions.discard(instance_id)

    async def fan_out_stream_event(self, instance_id: str, data: dict) -> None:
        """Enqueue a stream event to all connections subscribed to instance_id.

        Uses put_nowait() with QueueFull handling for backpressure protection.
        If a connection's queue is full, the event is dropped and a warning is logged.
        """
        msg = {"type": "stream_event", "instance_id": instance_id, "data": data}
        for user_conns in list(self._connections.values()):
            for conn in user_conns:
                if instance_id in conn.subscriptions:
                    try:
                        conn.queue.put_nowait(msg)
                    except asyncio.QueueFull:
                        logger.warning(
                            "Queue full for user=%s instance=%s — dropping stream event",
                            conn.user_id,
                            instance_id,
                        )

    async def broadcast_node_status(
        self, node_id: str, status: str, team_user_ids: set[str] | None = None
    ) -> None:
        """Broadcast a node status update to relevant frontend connections.

        If team_user_ids is None, broadcast to ALL connected users.
        If provided, only broadcast to users whose user_id is in the set.
        Uses put_nowait() with QueueFull handling.
        """
        msg = {"type": "node_status_update", "node_id": node_id, "status": status}
        for user_id, user_conns in list(self._connections.items()):
            if team_user_ids is not None and user_id not in team_user_ids:
                continue
            for conn in user_conns:
                try:
                    conn.queue.put_nowait(msg)
                except asyncio.QueueFull:
                    logger.warning(
                        "Queue full for user=%s — dropping node_status_update node=%s",
                        user_id,
                        node_id,
                    )

    async def broadcast_new_node_alert(self, node_id: str) -> None:
        """Broadcast a new node alert to ALL connected frontend users.

        New nodes have no team assignment yet, so all users are notified.
        Uses put_nowait() with QueueFull handling.
        """
        msg = {"type": "new_node_alert", "node_id": node_id}
        for user_id, user_conns in list(self._connections.items()):
            for conn in user_conns:
                try:
                    conn.queue.put_nowait(msg)
                except asyncio.QueueFull:
                    logger.warning(
                        "Queue full for user=%s — dropping new_node_alert node=%s",
                        user_id,
                        node_id,
                    )

    async def broadcast_instance_status(self, instance_id: str, status: str) -> None:
        """Broadcast an instance status update to connections subscribed to that instance.

        Uses put_nowait() with QueueFull handling.
        """
        msg = {"type": "instance_status", "instance_id": instance_id, "status": status}
        for user_conns in list(self._connections.values()):
            for conn in user_conns:
                if instance_id in conn.subscriptions:
                    try:
                        conn.queue.put_nowait(msg)
                    except asyncio.QueueFull:
                        logger.warning(
                            "Queue full for user=%s instance=%s — dropping instance_status",
                            conn.user_id,
                            instance_id,
                        )


frontend_manager = FrontendConnectionManager()
