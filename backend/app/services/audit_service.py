"""Fire-and-forget audit log write helper.

This module provides a single async function that writes a row to the audit_log
table. It NEVER raises — audit failures must not break business logic. All
exceptions are caught, logged, and silently swallowed.
"""
import logging

from app.database import get_session_maker
from app.models.audit import AuditLog

logger = logging.getLogger(__name__)


async def write_audit_log(
    event_type: str,
    node_id: str | None = None,
    instance_id: str | None = None,
    user_id: str | None = None,
    details: dict | None = None,
) -> None:
    """Write an audit log row. Never raises — failures are logged and swallowed.

    Args:
        event_type: Type of event (e.g. "execute", "kill", "instance_finished").
        node_id: The node involved, if applicable.
        instance_id: The instance involved, if applicable.
        user_id: The user who triggered the action, if applicable.
        details: Optional dict of additional context (truncated prompt, exit code, etc.).
    """
    async with get_session_maker()() as session:
        try:
            session.add(
                AuditLog(
                    event_type=event_type,
                    node_id=node_id,
                    instance_id=instance_id,
                    user_id=user_id,
                    details=details,
                )
            )
            await session.commit()
        except Exception as exc:
            await session.rollback()
            logger.error(
                "Failed to write audit log (event_type=%s, node_id=%s, instance_id=%s): %s",
                event_type,
                node_id,
                instance_id,
                exc,
            )
