"""Pydantic response models for node, instance, and stream event REST endpoints."""
from datetime import datetime

from pydantic import BaseModel


class NodeResponse(BaseModel):
    node_id: str
    platform: str
    version: str
    projects: list[str] | None
    status: str
    first_seen: datetime
    connected_at: datetime | None
    last_heartbeat: datetime | None
    last_seen: datetime | None

    model_config = {"from_attributes": True}


class InstanceResponse(BaseModel):
    instance_id: str
    node_id: str
    project: str
    prompt: str | None
    session_id: str | None
    status: str
    exit_code: int | None
    error: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class StreamEventResponse(BaseModel):
    id: int
    instance_id: str
    sequence_num: int
    data: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class ExecuteRequest(BaseModel):
    node_id: str
    project: str
    work_dir: str
    prompt: str
    session_id: str | None = None


class ExecuteResponse(BaseModel):
    instance_id: str


class KillRequest(BaseModel):
    node_id: str
