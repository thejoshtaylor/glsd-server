"""In-memory WebSocket connection registry for GSD nodes."""
import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime

from fastapi import WebSocket
from pydantic import BaseModel

from app.ws.protocol import Envelope, new_msg_id


@dataclass
class NodeConnection:
    node_id: str
    websocket: WebSocket
    platform: str
    version: str
    projects: list[str]
    connected_at: datetime
    last_heartbeat: datetime


class ConnectionManager:
    """In-memory registry of connected GSD nodes with per-node locking."""

    def __init__(self) -> None:
        self._connections: dict[str, NodeConnection] = {}
        self._node_locks: dict[str, asyncio.Lock] = {}
        self._instance_streams: dict[str, list[dict]] = {}

    def get_lock(self, node_id: str) -> asyncio.Lock:
        """Return the per-node asyncio.Lock, creating it on first access."""
        if node_id not in self._node_locks:
            self._node_locks[node_id] = asyncio.Lock()
        return self._node_locks[node_id]

    def register(self, conn: NodeConnection) -> None:
        """Store a NodeConnection keyed by node_id."""
        self._connections[conn.node_id] = conn

    def deregister(self, node_id: str) -> NodeConnection | None:
        """Remove and return the NodeConnection, or None if not found."""
        return self._connections.pop(node_id, None)

    def get(self, node_id: str) -> NodeConnection | None:
        """Look up a NodeConnection by node_id."""
        return self._connections.get(node_id)

    def update_heartbeat(self, node_id: str, ts: datetime) -> None:
        """Update last_heartbeat on the NodeConnection if it exists."""
        conn = self._connections.get(node_id)
        if conn is not None:
            conn.last_heartbeat = ts

    def all_connections(self) -> list[NodeConnection]:
        """Return a list of all active NodeConnections."""
        return list(self._connections.values())

    def append_stream_event(self, instance_id: str, data: dict) -> None:
        """Append a parsed stream event to the in-memory buffer for an instance."""
        if instance_id not in self._instance_streams:
            self._instance_streams[instance_id] = []
        self._instance_streams[instance_id].append(data)

    def get_stream_events(self, instance_id: str) -> list[dict]:
        """Return buffered stream events for an instance."""
        return self._instance_streams.get(instance_id, [])

    def clear_stream_events(self, instance_id: str) -> None:
        """Remove the stream buffer for a completed instance."""
        self._instance_streams.pop(instance_id, None)

    async def send_to_node(
        self, node_id: str, msg_type: str, payload: BaseModel | None = None
    ) -> bool:
        """Send a message to a connected node.

        Builds an Envelope with a fresh message ID and sends it as JSON text.
        Returns True on success, False if the node is not connected.
        """
        conn = self._connections.get(node_id)
        if conn is None:
            return False
        envelope: dict = {"type": msg_type, "id": new_msg_id()}
        if payload is not None:
            envelope["payload"] = payload.model_dump(exclude_none=True)
        await conn.websocket.send_text(json.dumps(envelope))
        return True


connection_manager = ConnectionManager()
