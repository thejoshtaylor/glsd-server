"""REST endpoint for audit log queries, scoped to the current user's teams."""
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbSession
from app.models.audit import AuditLog
from app.schemas.audit import AuditLogResponse
from app.services.node_service import user_can_access_node

router = APIRouter(prefix="/api", tags=["audit"])


@router.get("/audit", response_model=list[AuditLogResponse])
async def get_audit_log(
    current_user: CurrentUser,
    db: DbSession,
    node_id: str = Query(...),
    type: str | None = Query(None),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
) -> list[AuditLogResponse]:
    """Return audit log rows for a specific node.

    The node_id parameter is required to enforce team-scoped access — the server
    validates that the current user belongs to a team that owns the requested node
    before returning any audit rows.

    Args:
        node_id: Required. The node to query audit logs for.
        type: Optional. Filter by event_type (execute, kill, instance_finished, instance_error).
        limit: Max rows to return (default 50, max 500).
        offset: Pagination offset (default 0).
    """
    if not await user_can_access_node(current_user.user_id, node_id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this node",
        )

    stmt = (
        select(AuditLog)
        .where(AuditLog.node_id == node_id)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
        .offset(offset)
    )
    if type is not None:
        stmt = stmt.where(AuditLog.event_type == type)

    result = await db.execute(stmt)
    return [AuditLogResponse.model_validate(r) for r in result.scalars()]
