"""Bootstrap service: create an initial admin user on startup if configured."""

import logging
import uuid

from sqlalchemy import select

from app.config import Settings
from app.database import get_session_maker
from app.models.team import Team, TeamMember
from app.models.user import User
from app.services import auth_service

logger = logging.getLogger(__name__)


async def ensure_initial_admin(settings: Settings) -> None:
    """Idempotently create an initial admin user + personal team on startup.

    No-op if INITIAL_ADMIN_EMAIL or INITIAL_ADMIN_PASSWORD are unset.
    No-op if the user already exists.
    """
    if settings.initial_admin_email is None or settings.initial_admin_password is None:
        return

    email = settings.initial_admin_email
    session_maker = get_session_maker()

    async with session_maker() as session:
        async with session.begin():
            result = await session.execute(select(User).where(User.email == email))
            existing = result.scalar_one_or_none()

            if existing is not None:
                logger.info("Initial admin user already exists, skipping")
                return

            user_id = str(uuid.uuid4())
            team_id = str(uuid.uuid4())
            hashed = auth_service.hash_password(settings.initial_admin_password)

            session.add(User(user_id=user_id, email=email, hashed_password=hashed))
            await session.flush()  # flush User first — Team FK references user_id
            session.add(Team(team_id=team_id, name=f"{email}'s Team", owner_id=user_id))
            session.add(TeamMember(team_id=team_id, user_id=user_id, role="owner"))

            logger.info("Created initial admin user: %s", email)
