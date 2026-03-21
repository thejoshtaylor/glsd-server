from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUser, DbSession
from app.models.node import Node
from app.schemas.teams import (
    MemberAdd,
    MemberResponse,
    NodeAssign,
    NodeTeamResponse,
    TeamCreate,
    TeamResponse,
)
from app.services import team_service

router = APIRouter(prefix="/api/teams", tags=["teams"])


@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    body: TeamCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> TeamResponse:
    """Create a new team. The requesting user becomes the owner."""
    team = await team_service.create_team(body.name, current_user.user_id, db)
    return TeamResponse.model_validate(team)


@router.get("", response_model=list[TeamResponse])
async def list_teams(
    current_user: CurrentUser,
    db: DbSession,
) -> list[TeamResponse]:
    """List all teams the current user belongs to."""
    teams = await team_service.list_user_teams(current_user.user_id, db)
    return [TeamResponse.model_validate(t) for t in teams]


@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(
    team_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> TeamResponse:
    """Get a specific team (user must be a member)."""
    team = await team_service.get_team(team_id, current_user.user_id, db)
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )
    return TeamResponse.model_validate(team)


@router.post(
    "/{team_id}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_member(
    team_id: str,
    body: MemberAdd,
    current_user: CurrentUser,
    db: DbSession,
) -> MemberResponse:
    """Add a user to a team by email. Requesting user must be team owner."""
    member = await team_service.add_member(
        team_id, body.email, body.role, current_user.user_id, db
    )
    # Fetch the email for the response — the service validated the user exists
    from app.models.user import User
    from sqlalchemy import select

    result = await db.execute(
        select(User.email).where(User.user_id == member.user_id)
    )
    email = result.scalar_one()
    return MemberResponse(
        user_id=member.user_id,
        email=email,
        role=member.role,
        joined_at=member.joined_at,
    )


@router.get("/{team_id}/members", response_model=list[MemberResponse])
async def list_members(
    team_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> list[MemberResponse]:
    """List all members of a team (user must be a member)."""
    members = await team_service.list_team_members(team_id, current_user.user_id, db)
    return [MemberResponse(**m) for m in members]


@router.delete(
    "/{team_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_member(
    team_id: str,
    user_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Remove a member from a team. Requesting user must be team owner."""
    await team_service.remove_member(team_id, user_id, current_user.user_id, db)


@router.post(
    "/{team_id}/nodes",
    response_model=NodeTeamResponse,
    status_code=status.HTTP_201_CREATED,
)
async def assign_node(
    team_id: str,
    body: NodeAssign,
    current_user: CurrentUser,
    db: DbSession,
) -> NodeTeamResponse:
    """Assign a node to a team. Requesting user must be team owner."""
    assignment = await team_service.assign_node_to_team(
        team_id, body.node_id, current_user.user_id, db
    )
    return NodeTeamResponse.model_validate(assignment)


from pydantic import BaseModel as _BaseModel


class NodeResponse(_BaseModel):
    """Minimal node response for team node listing."""

    node_id: str
    platform: str
    version: str
    status: str

    model_config = {"from_attributes": True}


@router.get("/{team_id}/nodes", response_model=list[NodeResponse])
async def list_nodes(
    team_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> list[NodeResponse]:
    """List all nodes assigned to a team (user must be a member)."""
    nodes = await team_service.list_team_nodes(team_id, current_user.user_id, db)
    return [NodeResponse.model_validate(n) for n in nodes]
