from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)
    node_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    instance_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    event_type: Mapped[str] = mapped_column(String(64))
    details: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
