import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class NodeStatus(str, enum.Enum):
    connected = "connected"
    stale = "stale"
    disconnected = "disconnected"


class Node(Base):
    __tablename__ = "nodes"

    node_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    platform: Mapped[str] = mapped_column(String(64))
    version: Mapped[str] = mapped_column(String(32))
    # JSON instead of ARRAY for Alembic autogenerate compatibility.
    # Stores a list of project name strings. May be empty list.
    projects: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=list)
    team_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("teams.team_id"), nullable=True
    )
    status: Mapped[NodeStatus] = mapped_column(
        SAEnum(NodeStatus, name="node_status", create_constraint=True),
        default=NodeStatus.disconnected,
    )
    first_seen: Mapped[datetime] = mapped_column(server_default=func.now())
    connected_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    last_heartbeat: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    last_seen: Mapped[Optional[datetime]] = mapped_column(nullable=True)
