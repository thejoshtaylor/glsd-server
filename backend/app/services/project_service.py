"""DB queries for project CRUD and path validation."""
import os

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project


def validate_work_dir(raw: str) -> str:
    """Validate and normalize a work_dir path.

    Returns the normalized path. Raises ValueError for:
    - Empty or current-directory-only paths
    - Paths containing directory traversal (..)
    """
    normalized = os.path.normpath(raw)
    if ".." in normalized.split(os.sep):
        raise ValueError(
            f"Invalid work_dir: directory traversal not allowed: {raw!r}"
        )
    if not normalized or normalized == ".":
        raise ValueError(
            f"Invalid work_dir: empty or current directory: {raw!r}"
        )
    return normalized


async def upsert_project(
    node_id: str, name: str, work_dir: str, db: AsyncSession
) -> Project:
    """Insert or update a project row.

    Uses PostgreSQL INSERT ... ON CONFLICT to handle duplicate (node_id, name)
    gracefully — re-registering the same project updates work_dir.
    """
    stmt = pg_insert(Project).values(
        node_id=node_id, name=name, work_dir=work_dir
    )
    stmt = stmt.on_conflict_do_update(
        constraint="uq_project_node_name",
        set_={"work_dir": stmt.excluded.work_dir},
    ).returning(Project)
    result = await db.execute(stmt)
    await db.flush()
    return result.scalar_one()


async def list_projects_for_node(node_id: str, db: AsyncSession) -> list[Project]:
    """Return all projects registered on a node, ordered by name."""
    result = await db.execute(
        select(Project).where(Project.node_id == node_id).order_by(Project.name)
    )
    return list(result.scalars())
