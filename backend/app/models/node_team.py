from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class NodeTeam(Base):
    __tablename__ = "node_teams"

    node_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("nodes.node_id"), primary_key=True
    )
    team_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teams.team_id"), primary_key=True
    )
    assigned_at: Mapped[datetime] = mapped_column(server_default=func.now())
