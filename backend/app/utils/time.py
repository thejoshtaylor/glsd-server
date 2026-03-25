"""Timezone-naive UTC helpers for PostgreSQL TIMESTAMP WITHOUT TIME ZONE columns."""

from datetime import datetime, timezone


def utcnow() -> datetime:
    """Return current UTC time as a naive datetime (no tzinfo).

    All database columns use TIMESTAMP WITHOUT TIME ZONE. asyncpg rejects
    timezone-aware datetimes for these columns, so all application code
    must produce naive UTC datetimes.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)
