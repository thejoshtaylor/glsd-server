"""Add event_type index to audit_log table.

Migration 0001 created the audit_log table with timestamp and node_id indexes.
This migration adds the missing event_type index for efficient filtering by event type.

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-23
"""

from alembic import op

# Revision identifiers, used by Alembic.
revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # audit_log table already exists from migration 0001.
    # Add the missing event_type index for efficient filtering.
    op.create_index("ix_audit_log_event_type", "audit_log", ["event_type"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_audit_log_event_type", table_name="audit_log")
