"""Add projects table for node project management.

Each project is associated with a node and has a unique (node_id, name) pair.
Tracks the work_dir on the node filesystem for execute dispatch.

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-25
"""

import sqlalchemy as sa
from alembic import op

# Revision identifiers, used by Alembic.
revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("node_id", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("work_dir", sa.String(1024), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["node_id"],
            ["nodes.node_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("node_id", "name", name="uq_project_node_name"),
    )
    op.create_index("ix_projects_node_id", "projects", ["node_id"])


def downgrade() -> None:
    op.drop_index("ix_projects_node_id", table_name="projects")
    op.drop_table("projects")
