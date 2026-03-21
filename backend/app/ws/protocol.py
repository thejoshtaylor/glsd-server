"""GSD wire protocol v1.2.0 — Pydantic models matching protocol-spec.md Section 3 exactly."""
import secrets
from typing import Any

from pydantic import BaseModel


def new_msg_id() -> str:
    """Generate a unique 32-character hex message ID."""
    return secrets.token_hex(16)


class Envelope(BaseModel):
    type: str
    id: str
    payload: dict[str, Any] | None = None


class InstanceSummary(BaseModel):
    instance_id: str
    project: str
    session_id: str | None = None


class NodeRegisterPayload(BaseModel):
    node_id: str
    platform: str
    version: str
    projects: list[str]
    running_instances: list[InstanceSummary]


class AckPayload(BaseModel):
    instance_id: str


class StreamEventPayload(BaseModel):
    """stream_event payload from node.

    data is double-encoded JSON — use json.loads(payload.data) to get the parsed NDJSON object.
    """

    instance_id: str
    data: str


class InstanceStartedPayload(BaseModel):
    instance_id: str
    project: str
    session_id: str | None = None


class InstanceFinishedPayload(BaseModel):
    instance_id: str
    exit_code: int


class InstanceErrorPayload(BaseModel):
    instance_id: str
    error: str


class NodeDisconnectPayload(BaseModel):
    reason: str | None = None


class ExecutePayload(BaseModel):
    instance_id: str
    project: str
    work_dir: str
    prompt: str
    session_id: str | None = None


class KillPayload(BaseModel):
    instance_id: str


class StatusRequestPayload(BaseModel):
    pass


MSG_TYPES: dict[str, type[BaseModel]] = {
    "node_register": NodeRegisterPayload,
    "ack": AckPayload,
    "stream_event": StreamEventPayload,
    "instance_started": InstanceStartedPayload,
    "instance_finished": InstanceFinishedPayload,
    "instance_error": InstanceErrorPayload,
    "node_disconnect": NodeDisconnectPayload,
    "execute": ExecutePayload,
    "kill": KillPayload,
    "status_request": StatusRequestPayload,
}
