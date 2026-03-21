import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.node import Node
from app.models.node_team import NodeTeam
from app.models.team import Team, TeamMember
from app.models.user import User


async def create_team(name: str, owner_id: str, db: AsyncSession) -> Team:
    """Create a new team and auto-add the creator as owner."""
    team_id = str(uuid.uuid4())
    team = Team(team_id=team_id, name=name, owner_id=owner_id)
    member = TeamMember(team_id=team_id, user_id=owner_id, role="owner")
    db.add(team)
    db.add(member)
    await db.flush()
    return team


async def list_user_teams(user_id: str, db: AsyncSession) -> list[Team]:
    """List all teams the user is a member of."""
    result = await db.execute(
        select(Team)
        .join(TeamMember, Team.team_id == TeamMember.team_id)
        .where(TeamMember.user_id == user_id)
    )
    return list(result.scalars().unique())


async def get_team(team_id: str, user_id: str, db: AsyncSession) -> Team | None:
    """Get a team if the user is a member of it. Returns None if not found or no access."""
    result = await db.execute(
        select(Team)
        .join(TeamMember, Team.team_id == TeamMember.team_id)
        .where(Team.team_id == team_id)
        .where(TeamMember.user_id == user_id)
    )
    return result.scalars().first()


async def _verify_owner(team_id: str, user_id: str, db: AsyncSession) -> None:
    """Raise 403 if user is not an owner of the team."""
    result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user_id,
            TeamMember.role == "owner",
        )
    )
    if result.scalars().first() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only team owners can perform this action",
        )


async def _verify_member(team_id: str, user_id: str, db: AsyncSession) -> None:
    """Raise 403 if user is not a member of the team."""
    result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user_id,
        )
    )
    if result.scalars().first() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )


async def add_member(
    team_id: str,
    email: str,
    role: str,
    requesting_user_id: str,
    db: AsyncSession,
) -> TeamMember:
    """Add a user to a team by email. Requesting user must be owner."""
    # Verify requester is owner
    await _verify_owner(team_id, requesting_user_id, db)

    # Validate role
    if role not in ("owner", "member"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Role must be 'owner' or 'member'",
        )

    # Look up target user by email
    result = await db.execute(select(User).where(User.email == email))
    target = result.scalars().first()
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check if already a member
    result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == target.user_id,
        )
    )
    if result.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a team member",
        )

    member = TeamMember(team_id=team_id, user_id=target.user_id, role=role)
    db.add(member)
    await db.flush()
    return member


async def list_team_members(
    team_id: str, user_id: str, db: AsyncSession
) -> list[dict]:
    """List all members of a team (user must be a member)."""
    await _verify_member(team_id, user_id, db)

    result = await db.execute(
        select(
            TeamMember.user_id,
            User.email,
            TeamMember.role,
            TeamMember.joined_at,
        )
        .join(User, TeamMember.user_id == User.user_id)
        .where(TeamMember.team_id == team_id)
    )
    rows = result.all()
    return [
        {
            "user_id": row.user_id,
            "email": row.email,
            "role": row.role,
            "joined_at": row.joined_at,
        }
        for row in rows
    ]


async def assign_node_to_team(
    team_id: str,
    node_id: str,
    requesting_user_id: str,
    db: AsyncSession,
) -> NodeTeam:
    """Assign a node to a team. Requesting user must be owner."""
    # Verify requester is owner
    await _verify_owner(team_id, requesting_user_id, db)

    # Verify node exists
    node = await db.get(Node, node_id)
    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found",
        )

    # Check if already assigned
    result = await db.execute(
        select(NodeTeam).where(
            NodeTeam.node_id == node_id,
            NodeTeam.team_id == team_id,
        )
    )
    if result.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Node already assigned to this team",
        )

    assignment = NodeTeam(node_id=node_id, team_id=team_id)
    db.add(assignment)
    await db.flush()
    return assignment


async def list_team_nodes(
    team_id: str, user_id: str, db: AsyncSession
) -> list[Node]:
    """List all nodes assigned to a team (user must be a member)."""
    await _verify_member(team_id, user_id, db)

    result = await db.execute(
        select(Node)
        .join(NodeTeam, Node.node_id == NodeTeam.node_id)
        .where(NodeTeam.team_id == team_id)
    )
    return list(result.scalars().unique())


async def remove_member(
    team_id: str,
    target_user_id: str,
    requesting_user_id: str,
    db: AsyncSession,
) -> None:
    """Remove a member from a team. Requesting user must be owner."""
    # Verify requester is owner
    await _verify_owner(team_id, requesting_user_id, db)

    # Cannot remove the last owner
    result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.role == "owner",
        )
    )
    owners = result.scalars().all()

    # Check if target is the only owner
    is_only_owner = (
        len(owners) == 1 and owners[0].user_id == target_user_id
    )
    if is_only_owner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the last owner",
        )

    # Find and delete the target member row
    result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == target_user_id,
        )
    )
    member = result.scalars().first()
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this team",
        )
    await db.delete(member)
    await db.flush()
