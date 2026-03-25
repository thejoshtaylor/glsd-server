"""ORM model for projects managed on GSD nodes."""
from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Project(Base):
    """A project registered on a specific node.

    Tracks name and work_dir for each project. A node/name pair is unique —
    re-registering the same project updates the work_dir via upsert.
    """

    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("node_id", "name", name="uq_project_node_name"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    node_id: Mapped[str] = mapped_column(
        String(255),
        ForeignKey("nodes.node_id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    work_dir: Mapped[str] = mapped_column(String(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
