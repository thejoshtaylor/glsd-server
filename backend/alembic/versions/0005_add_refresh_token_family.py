"""Add family_id column to refresh_tokens table for token rotation families.

Each refresh token belongs to a family (rotation chain). When a rotated-out
token is replayed, the entire family is revoked (reuse detection, SES-04).

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op

# Revision identifiers, used by Alembic.
revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add family_id with a server_default so existing rows get a UUID.
    op.add_column(
        "refresh_tokens",
        sa.Column(
            "family_id",
            sa.String(36),
            nullable=False,
            server_default=sa.text("gen_random_uuid()::text"),
        ),
    )
    op.create_index(
        "ix_refresh_tokens_family_id",
        "refresh_tokens",
        ["family_id"],
        unique=False,
    )
    # Remove the server_default — new rows must supply family_id explicitly.
    op.alter_column("refresh_tokens", "family_id", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_family_id", table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "family_id")
