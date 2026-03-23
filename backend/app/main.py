import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import get_engine
from app.routers import audit, auth, health, nodes, teams
from app.ws.frontend_router import router as frontend_ws_router
from app.ws.health import stale_node_scanner
from app.ws.router import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: launch background tasks
    scanner_task = asyncio.create_task(stale_node_scanner())
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
app.include_router(audit.router)
app.include_router(ws_router)
app.include_router(frontend_ws_router)
