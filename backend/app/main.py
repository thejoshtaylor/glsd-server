from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import get_engine
from app.routers import health
from app.ws.router import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Alembic handles schema; engine is lazy-initialized on first DB call.
    # This lifespan handler is the extension point for Phase 4 background tasks
    # (health monitor, stale node scanner).
    yield
    # Shutdown: dispose engine connection pool cleanly.
    engine = get_engine()
    await engine.dispose()


app = FastAPI(title="GLSD Server", lifespan=lifespan)

app.include_router(health.router)
app.include_router(ws_router)
