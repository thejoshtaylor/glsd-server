from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Team(Base):
    __tablename__ = "teams"

    team_id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    name: Mapped[str] = mapped_column(String(255))
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class TeamMember(Base):
    __tablename__ = "team_members"

    team_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teams.team_id"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.user_id"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(32), default="member")  # "owner" | "member"
    joined_at: Mapped[datetime] = mapped_column(server_default=func.now())
