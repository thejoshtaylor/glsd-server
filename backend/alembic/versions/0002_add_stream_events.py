"""Add stream_events table

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stream_events",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("instance_id", sa.String(36), sa.ForeignKey("instances.instance_id"), nullable=False),
        sa.Column("sequence_num", sa.Integer, nullable=False),
        sa.Column("data", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_stream_events_instance_seq", "stream_events", ["instance_id", "sequence_num"])


def downgrade() -> None:
    op.drop_index("ix_stream_events_instance_seq", table_name="stream_events")
    op.drop_table("stream_events")
