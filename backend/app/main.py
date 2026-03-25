import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.database import get_engine
from app.routers import audit, auth, health, nodes, projects, teams, transcribe
from app.services.admin_bootstrap import ensure_initial_admin
from app.ws.frontend_router import router as frontend_ws_router
from app.ws.health import stale_node_scanner
from app.ws.router import router as ws_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: launch background tasks
    scanner_task = asyncio.create_task(stale_node_scanner())
    settings = get_settings()
    try:
        await ensure_initial_admin(settings)
    except Exception:
        logger.exception("Admin bootstrap failed — server continues without initial admin")
    yield
    # Shutdown: cancel background tasks, dispose engine
    scanner_task.cancel()
    try:
        await scanner_task
    except asyncio.CancelledError:
        pass
    engine = get_engine()
    await engine.dispose()


app = FastAPI(title="GLSD Server", lifespan=lifespan)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(teams.router)
app.include_router(nodes.router)
app.include_router(projects.router)
app.include_router(audit.router)
app.include_router(transcribe.router)
app.include_router(ws_router)
app.include_router(frontend_ws_router)
