"""Initial schema -- all six tables.

Revision ID: 0001
Revises: None
Create Date: 2026-03-20

"""

from alembic import op
import sqlalchemy as sa

# Revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. users
    op.create_table("users",
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    # 2. teams
    op.create_table("teams",
        sa.Column("team_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("owner_id", sa.String(36), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.user_id"]),
        sa.PrimaryKeyConstraint("team_id"),
    )

    # 3. team_members
    op.create_table("team_members",
        sa.Column("team_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("role", sa.String(32), nullable=False, server_default="member"),
        sa.Column(
            "joined_at",
            sa.TIMESTAMP(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["team_id"], ["teams.team_id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
        sa.PrimaryKeyConstraint("team_id", "user_id"),
    )

    # 4. nodes — node_status enum created automatically by SQLAlchemy
    op.create_table("nodes",
        sa.Column("node_id", sa.String(255), nullable=False),
        sa.Column("platform", sa.String(64), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("projects", sa.JSON(), nullable=True),
        sa.Column("team_id", sa.String(36), nullable=True),
        sa.Column(
            "status",
            sa.Enum("connected", "stale", "disconnected", name="node_status"),
            nullable=False,
            server_default="disconnected",
        ),
        sa.Column(
            "first_seen",
            sa.TIMESTAMP(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("connected_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("last_heartbeat", sa.TIMESTAMP(), nullable=True),
        sa.Column("last_seen", sa.TIMESTAMP(), nullable=True),
        sa.ForeignKeyConstraint(["team_id"], ["teams.team_id"]),
        sa.PrimaryKeyConstraint("node_id"),
    )

    # 5. instances — instance_status enum created automatically by SQLAlchemy
    op.create_table("instances",
        sa.Column("instance_id", sa.String(36), nullable=False),
        sa.Column("node_id", sa.String(255), nullable=False),
        sa.Column("project", sa.String(255), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=True),
        sa.Column("session_id", sa.String(255), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pending", "running", "finished", "errored", name="instance_status"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("exit_code", sa.Integer(), nullable=True),
        sa.Column("error", sa.String(2048), nullable=True),
        sa.Column("started_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("finished_at", sa.TIMESTAMP(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.node_id"]),
        sa.PrimaryKeyConstraint("instance_id"),
    )

    # 6. audit_log
    op.create_table("audit_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "timestamp",
            sa.TIMESTAMP(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("node_id", sa.String(255), nullable=True),
        sa.Column("instance_id", sa.String(36), nullable=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_audit_log_timestamp"), "audit_log", ["timestamp"], unique=False
    )
    op.create_index(
        op.f("ix_audit_log_node_id"), "audit_log", ["node_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_log_node_id"), table_name="audit_log")
    op.drop_index(op.f("ix_audit_log_timestamp"), table_name="audit_log")
    op.drop_table("audit_log")
    op.drop_table("instances")
    op.drop_table("nodes")
    op.drop_table("team_members")
    op.drop_table("teams")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    sa.Enum(name="instance_status").drop(op.get_bind())
    sa.Enum(name="node_status").drop(op.get_bind())
