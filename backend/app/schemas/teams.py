from datetime import datetime

from pydantic import BaseModel


class TeamCreate(BaseModel):
    name: str


class TeamResponse(BaseModel):
    team_id: str
    name: str
    owner_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberAdd(BaseModel):
    email: str
    role: str = "member"  # "owner" | "member"


class MemberResponse(BaseModel):
    user_id: str
    email: str
    role: str
    joined_at: datetime


class NodeAssign(BaseModel):
    node_id: str


class NodeTeamResponse(BaseModel):
    node_id: str
    team_id: str
    assigned_at: datetime

    model_config = {"from_attributes": True}
