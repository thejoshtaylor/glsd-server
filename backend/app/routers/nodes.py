"""REST endpoints for nodes, instances, stream events, execute, and kill.

All endpoints are team-scoped via the existing node_service layer.
Users only see nodes and instances that belong to their teams.
"""
import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbSession
from app.models.instance import Instance
from app.models.stream_event import StreamEvent
from app.schemas.nodes import (
    ExecuteRequest,
    ExecuteResponse,
    InstanceResponse,
    KillRequest,
    NodeResponse,
    StreamEventResponse,
)
from app.services.node_service import (
    get_node_for_user,
    list_instances_for_user,
    list_nodes_for_user,
    user_can_access_instance,
)
from app.ws.commands import dispatch_execute, dispatch_kill

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["nodes"])


@router.get("/nodes", response_model=list[NodeResponse])
async def get_nodes(current_user: CurrentUser, db: DbSession) -> list[NodeResponse]:
    """Return all nodes accessible to the current user via their team memberships."""
    nodes = await list_nodes_for_user(current_user.user_id, db)
    return [NodeResponse.model_validate(n) for n in nodes]


@router.get("/nodes/{node_id}", response_model=NodeResponse)
async def get_node(node_id: str, current_user: CurrentUser, db: DbSession) -> NodeResponse:
    """Return a specific node if the current user has team-based access."""
    node = await get_node_for_user(current_user.user_id, node_id, db)
    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {node_id} not found or not accessible",
        )
    return NodeResponse.model_validate(node)


@router.get("/instances", response_model=list[InstanceResponse])
async def get_instances(
    current_user: CurrentUser,
    db: DbSession,
    node_id: Annotated[str | None, Query()] = None,
) -> list[InstanceResponse]:
    """Return all instances accessible to the current user, optionally filtered by node_id."""
    instances = await list_instances_for_user(current_user.user_id, db)
    if node_id is not None:
        instances = [i for i in instances if i.node_id == node_id]
    return [InstanceResponse.model_validate(i) for i in instances]


@router.get("/instances/{instance_id}", response_model=InstanceResponse)
async def get_instance(
    instance_id: str, current_user: CurrentUser, db: DbSession
) -> InstanceResponse:
    """Return a specific instance if the current user has team-based access."""
    has_access = await user_can_access_instance(current_user.user_id, instance_id, db)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Instance {instance_id} not found or not accessible",
        )

    result = await db.execute(
        select(Instance).where(Instance.instance_id == instance_id)
    )
    instance = result.scalar_one_or_none()
    if instance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Instance {instance_id} not found",
        )
    return InstanceResponse.model_validate(instance)


@router.get("/instances/{instance_id}/stream", response_model=list[StreamEventResponse])
async def get_instance_stream(
    instance_id: str, current_user: CurrentUser, db: DbSession
) -> list[StreamEventResponse]:
    """Return persisted stream events for an instance, ordered by sequence number.

    Validates team-based access before returning events.
    """
    has_access = await user_can_access_instance(current_user.user_id, instance_id, db)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Instance {instance_id} not found or not accessible",
        )

    result = await db.execute(
        select(StreamEvent)
        .where(StreamEvent.instance_id == instance_id)
        .order_by(StreamEvent.sequence_num)
    )
    events = list(result.scalars())
    return [StreamEventResponse.model_validate(e) for e in events]


@router.post("/execute", response_model=ExecuteResponse, status_code=status.HTTP_200_OK)
async def execute(
    body: ExecuteRequest, current_user: CurrentUser, db: DbSession
) -> ExecuteResponse:
    """Dispatch an execute command to a connected node.

    Returns the generated instance_id. Validates team ownership, node
    connectivity, and project availability before dispatch.
    """
    try:
        instance_id = await dispatch_execute(
            body.node_id,
            body.project,
            body.work_dir,
            body.prompt,
            current_user.user_id,
            db,
            body.session_id,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return ExecuteResponse(instance_id=instance_id)


@router.post("/instances/{instance_id}/kill")
async def kill_instance(
    instance_id: str, body: KillRequest, current_user: CurrentUser, db: DbSession
) -> dict[str, str]:
    """Dispatch a kill command for a running instance.

    Does not immediately mark the instance as killed — the server waits for
    the terminal event (instance_finished or instance_error) from the node.
    """
    try:
        await dispatch_kill(body.node_id, instance_id, current_user.user_id, db)
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return {"detail": "Kill dispatched"}
