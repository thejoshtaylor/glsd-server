"""Pydantic response models for audit log REST endpoint."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    timestamp: datetime
    node_id: str | None
    instance_id: str | None
    user_id: str | None
    event_type: str
    details: dict | None

    model_config = {"from_attributes": True}
