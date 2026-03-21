from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class StreamEvent(Base):
    __tablename__ = "stream_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    instance_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("instances.instance_id"), nullable=False
    )
    sequence_num: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)  # Parsed NDJSON (json.loads of double-encoded data)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
