"""Node service: team-scoped queries for multi-tenancy enforcement.

All queries join through node_teams + team_members to ensure users only see
nodes and instances belonging to their teams.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.instance import Instance
from app.models.node import Node
from app.models.node_team import NodeTeam
from app.models.team import TeamMember


async def list_nodes_for_user(user_id: str, db: AsyncSession) -> list[Node]:
    """Return all nodes accessible to the user via their team memberships.

    A node may belong to multiple of the user's teams, so .unique() is used
    to deduplicate rows produced by the join.
    """
    result = await db.execute(
        select(Node)
        .join(NodeTeam, Node.node_id == NodeTeam.node_id)
        .join(TeamMember, NodeTeam.team_id == TeamMember.team_id)
        .where(TeamMember.user_id == user_id)
        .distinct()
    )
    return list(result.scalars().unique())


async def user_can_access_node(user_id: str, node_id: str, db: AsyncSession) -> bool:
    """Return True if the user has team-based access to the node.

    Uses a limit(1) query for efficiency — we only need to know existence.
    """
    result = await db.execute(
        select(TeamMember.user_id)
        .join(NodeTeam, TeamMember.team_id == NodeTeam.team_id)
        .where(TeamMember.user_id == user_id, NodeTeam.node_id == node_id)
        .limit(1)
    )
    return result.scalar() is not None


async def get_node_for_user(user_id: str, node_id: str, db: AsyncSession) -> Node | None:
    """Return the node if the user has team-based access, otherwise None.

    Same join as list_nodes_for_user but filtered by node_id.
    """
    result = await db.execute(
        select(Node)
        .join(NodeTeam, Node.node_id == NodeTeam.node_id)
        .join(TeamMember, NodeTeam.team_id == TeamMember.team_id)
        .where(TeamMember.user_id == user_id, Node.node_id == node_id)
        .distinct()
    )
    return result.scalars().unique().first()


async def list_instances_for_user(user_id: str, db: AsyncSession) -> list[Instance]:
    """Return all instances accessible to the user via their team memberships.

    Joins through instances -> nodes -> node_teams -> team_members.
    Uses .unique() to deduplicate rows from multi-team membership.
    """
    result = await db.execute(
        select(Instance)
        .join(Node, Instance.node_id == Node.node_id)
        .join(NodeTeam, Node.node_id == NodeTeam.node_id)
        .join(TeamMember, NodeTeam.team_id == TeamMember.team_id)
        .where(TeamMember.user_id == user_id)
        .distinct()
    )
    return list(result.scalars().unique())
