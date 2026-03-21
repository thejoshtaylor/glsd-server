import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class InstanceStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    finished = "finished"
    errored = "errored"


class Instance(Base):
    __tablename__ = "instances"

    instance_id: Mapped[str] = mapped_column(
        String(36), primary_key=True
    )  # Server-generated UUID
    node_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("nodes.node_id")
    )
    project: Mapped[str] = mapped_column(String(255))
    prompt: Mapped[Optional[str]] = mapped_column(nullable=True)  # The prompt sent to Claude
    session_id: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )  # Populated from instance_started
    status: Mapped[InstanceStatus] = mapped_column(
        SAEnum(InstanceStatus, name="instance_status", create_constraint=True),
        default=InstanceStatus.pending,
    )
    exit_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
