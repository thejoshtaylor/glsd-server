"""Pydantic request/response models for project management endpoints."""
from datetime import datetime

from pydantic import BaseModel


class ConnectProjectRequest(BaseModel):
    """Register an existing local folder as a project on a node."""

    node_id: str
    name: str
    work_dir: str


class CloneProjectRequest(BaseModel):
    """Clone a git repository onto a node and register it as a project."""

    node_id: str
    name: str
    work_dir: str
    repo_url: str


class BootstrapProjectRequest(BaseModel):
    """Bootstrap a new GSD project on a node via /gsd:new-project."""

    node_id: str
    name: str
    work_dir: str


class ProjectResponse(BaseModel):
    """Serialized project row."""

    id: int
    node_id: str
    name: str
    work_dir: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectActionResponse(BaseModel):
    """Response for project action endpoints.

    instance_id is None for connect (no execute dispatched),
    present for clone and bootstrap.
    """

    instance_id: str | None = None
    project: ProjectResponse
