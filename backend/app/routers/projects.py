"""REST endpoints for project management: connect, clone, bootstrap, list."""
import logging

from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUser, DbSession
from app.schemas.projects import (
    BootstrapProjectRequest,
    CloneProjectRequest,
    ConnectProjectRequest,
    ProjectActionResponse,
    ProjectResponse,
)
from app.services.node_service import user_can_access_node
from app.services.project_service import (
    list_projects_for_node,
    upsert_project,
    validate_work_dir,
)
from app.ws.commands import dispatch_execute

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["projects"])


@router.get("/nodes/{node_id}/projects", response_model=list[ProjectResponse])
async def list_projects(
    node_id: str, current_user: CurrentUser, db: DbSession
) -> list[ProjectResponse]:
    """Return all projects registered on a node for the current user's teams."""
    if not await user_can_access_node(current_user.user_id, node_id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="No access to node"
        )
    projects = await list_projects_for_node(node_id, db)
    return [ProjectResponse.model_validate(p) for p in projects]


@router.post("/projects/connect", response_model=ProjectActionResponse)
async def connect_project(
    body: ConnectProjectRequest, current_user: CurrentUser, db: DbSession
) -> ProjectActionResponse:
    """Register an existing local folder as a project (no execute dispatched)."""
    if not await user_can_access_node(current_user.user_id, body.node_id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="No access to node"
        )
    try:
        safe_dir = validate_work_dir(body.work_dir)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    project = await upsert_project(body.node_id, body.name, safe_dir, db)
    return ProjectActionResponse(
        instance_id=None,
        project=ProjectResponse.model_validate(project),
    )


@router.post("/projects/clone", response_model=ProjectActionResponse)
async def clone_project(
    body: CloneProjectRequest, current_user: CurrentUser, db: DbSession
) -> ProjectActionResponse:
    """Clone a git repository onto a node and register it as a project."""
    if not await user_can_access_node(current_user.user_id, body.node_id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="No access to node"
        )
    try:
        safe_dir = validate_work_dir(body.work_dir)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    prompt = f"git clone {body.repo_url} {safe_dir}"
    try:
        instance_id = await dispatch_execute(
            body.node_id,
            body.name,
            safe_dir,
            prompt,
            current_user.user_id,
            db,
            skip_project_check=True,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    project = await upsert_project(body.node_id, body.name, safe_dir, db)
    return ProjectActionResponse(
        instance_id=instance_id,
        project=ProjectResponse.model_validate(project),
    )


@router.post("/projects/bootstrap", response_model=ProjectActionResponse)
async def bootstrap_project(
    body: BootstrapProjectRequest, current_user: CurrentUser, db: DbSession
) -> ProjectActionResponse:
    """Bootstrap a new GSD project on a node via /gsd:new-project."""
    if not await user_can_access_node(current_user.user_id, body.node_id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="No access to node"
        )
    try:
        safe_dir = validate_work_dir(body.work_dir)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    prompt = "/gsd:new-project"
    try:
        instance_id = await dispatch_execute(
            body.node_id,
            body.name,
            safe_dir,
            prompt,
            current_user.user_id,
            db,
            skip_project_check=True,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    project = await upsert_project(body.node_id, body.name, safe_dir, db)
    return ProjectActionResponse(
        instance_id=instance_id,
        project=ProjectResponse.model_validate(project),
    )
