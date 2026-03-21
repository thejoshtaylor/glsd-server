from fastapi import APIRouter
from sqlalchemy import text

from app.dependencies import CurrentUser, DbSession
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check(db: DbSession, current_user: CurrentUser) -> HealthResponse:
    """Verifies FastAPI is running and database is reachable. Requires authentication."""
    await db.execute(text("SELECT 1"))
    return HealthResponse(status="ok", database="connected")
