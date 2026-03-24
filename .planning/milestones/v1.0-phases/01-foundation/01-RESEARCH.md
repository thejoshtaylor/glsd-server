# Phase 1: Foundation - Research

**Researched:** 2026-03-20
**Domain:** FastAPI scaffold + SQLAlchemy 2 async + Alembic migrations + Docker Compose single-worker deployment + pydantic-settings configuration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation choices are at Claude's discretion — pure infrastructure phase.

### Claude's Discretion
- FastAPI project structure and module layout
- SQLAlchemy model organization
- Alembic configuration approach
- Docker Compose service naming and networking
- Development vs production configuration split

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEPLOY-01 | Server runs via Docker Compose (FastAPI + PostgreSQL + React frontend) | Docker Compose multi-service patterns; FastAPI + PostgreSQL service config; React frontend service via Vite dev server or nginx-served build |
| DEPLOY-02 | Single-worker Uvicorn configuration (in-memory connection registry constraint) | `--workers 1` enforcement in compose command; Gunicorn + UvicornWorker pattern with explicit worker count |
| DEPLOY-03 | Environment variable configuration for all secrets (SERVER_TOKEN, OPENAI_API_KEY, DB credentials, JWT secret) | pydantic-settings with `.env` file support; Docker Compose `env_file` + `environment` patterns; no hardcoded values |
</phase_requirements>

---

## Summary

Phase 1 establishes the runnable skeleton that every subsequent phase builds on. It has three concrete deliverables: (1) a Docker Compose stack that starts FastAPI + PostgreSQL reliably with a single command, (2) the complete database schema created by Alembic migrations that run automatically at container startup, and (3) all secrets consumed from environment variables with no hardcoded values. No business logic, no WebSocket handlers, no auth — just correct async infrastructure patterns.

The most important decision made in this phase is the single-worker constraint enforced in `docker-compose.yml`. The in-memory `ConnectionManager` that phases 2–6 will build cannot be shared across processes. Setting `--workers 1` now means every subsequent phase is built against the correct single-process model with no retrofitting. This is not a limitation — it is the correct v1 architecture.

The second most important decision is establishing async-only database access patterns before any other code is written. SQLAlchemy 2 async with asyncpg is set up once here, with the `get_db` dependency and session factory wired correctly. Every subsequent phase that touches the database follows these patterns automatically. A single sync DB call anywhere in the hot path (event loop) cascades into node timeouts — establishing async-only from day one is the prevention.

**Primary recommendation:** Scaffold the project module layout first, establish the async DB session factory with the correct `get_db` dependency, create all six SQLAlchemy models with `Mapped[]` typing, generate and run Alembic migrations, then wire everything into Docker Compose with `--workers 1` enforced at the `command:` level.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | 3.12+ | Runtime | Current LTS; 3.12 perf improvements; 3.13 not yet widely validated |
| FastAPI | 0.115+ (latest: 0.135.1) | ASGI web framework | First-class async WebSocket + REST on same port; Pydantic v2 built-in; DI for async sessions |
| Uvicorn | 0.32+ | ASGI server | Standard async server for FastAPI; uvloop backend gives ~2x perf |
| pydantic-settings | 2.x | Typed env var config | Replaces python-dotenv; `@lru_cache` + `get_settings()` pattern; .env file support |
| SQLAlchemy | 2.0.44+ | ORM + async sessions | `sqlalchemy[asyncio]` with `AsyncSession` + `create_async_engine`; fully typed `Mapped[]` API |
| asyncpg | 0.31.0 | Async PostgreSQL driver | 2-5x faster than alternatives under concurrent load; used as `postgresql+asyncpg://` dialect |
| Alembic | 1.18.4 | Schema migrations | SQLAlchemy migration tool; `alembic upgrade head` at container startup |
| PostgreSQL | 16+ | Primary database | Decided constraint; Docker image: `postgres:16-alpine` |
| Gunicorn | 23+ | Production process manager | Wraps Uvicorn workers; use `gunicorn -k uvicorn.workers.UvicornWorker --workers 1` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-multipart | 0.0.12+ | File upload parsing | Required by FastAPI for `UploadFile` — needed for Phase 8 Whisper; install now to avoid surprises |
| PyJWT | 2.x | JWT creation/validation | Phase 3 auth — install now in requirements.txt; do NOT install python-jose |
| pwdlib | 0.2+ | Password hashing | Phase 3 auth — install now; do NOT install passlib |
| openai | 1.x | Whisper async client | Phase 8 voice — install now in requirements.txt |
| httpx | 0.27+ | Async HTTP client | Used by openai SDK internally; explicit install avoids version conflicts |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| asyncpg | psycopg3 | psycopg3 has nicer API but asyncpg is 2-5x faster under concurrent WebSocket load |
| SQLAlchemy 2 | SQLModel | SQLModel is convenient for simple CRUD but less mature async support |
| pydantic-settings | python-dotenv | python-dotenv has no type safety; pydantic-settings validates and coerces env vars |
| Alembic | Manual migrations | Alembic provides version history, rollback, and autogenerate from SQLAlchemy models |

### Installation

```bash
# Backend — install all up front to avoid dep conflicts later
pip install "fastapi[standard]>=0.115.0"
pip install "uvicorn[standard]>=0.32.0"
pip install "gunicorn>=23.0.0"
pip install "pydantic-settings>=2.6.0"
pip install "sqlalchemy[asyncio]>=2.0.44"
pip install "asyncpg>=0.31.0"
pip install "alembic>=1.18.0"
pip install "PyJWT>=2.9.0"
pip install "pwdlib[argon2]>=0.2.0"
pip install "python-multipart>=0.0.12"
pip install "openai>=1.50.0"
pip install "httpx>=0.27.0"
```

---

## Architecture Patterns

### Recommended Project Structure

```
glsd-server/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app factory, lifespan handler
│   │   ├── config.py            # pydantic-settings Settings class
│   │   ├── dependencies.py      # get_db, get_settings, future: get_current_user
│   │   ├── database.py          # create_async_engine, async_session_maker, Base
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── node.py          # Node SQLAlchemy model
│   │   │   ├── instance.py      # Instance SQLAlchemy model
│   │   │   ├── user.py          # User SQLAlchemy model
│   │   │   ├── team.py          # Team + TeamMember SQLAlchemy models
│   │   │   └── audit.py         # AuditLog SQLAlchemy model
│   │   ├── routers/
│   │   │   └── health.py        # GET /health endpoint (Phase 1 only)
│   │   └── schemas/             # Pydantic schemas (separate from ORM models)
│   │       └── health.py
│   ├── alembic/
│   │   ├── env.py               # Alembic env — must use SYNC engine for migrations
│   │   ├── script.py.mako
│   │   └── versions/
│   │       └── 0001_initial_schema.py
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── Dockerfile
│   └── entrypoint.sh            # alembic upgrade head && exec gunicorn ...
├── frontend/                    # Phase 7 — scaffold directory only in Phase 1
│   └── .gitkeep
└── docker-compose.yml
```

**Key structural decision:** Keep `models/` (SQLAlchemy ORM models) separate from `schemas/` (Pydantic request/response models). They serve different purposes and mixing them is a common source of coupling. SQLAlchemy models drive Alembic migrations; Pydantic schemas drive API validation.

### Pattern 1: SQLAlchemy 2 Async Engine + Session Factory

**What:** Single `create_async_engine` at application startup; `async_sessionmaker` bound to it; injected via `Depends(get_db)`.

**When to use:** All database access in every phase. Establish once, use everywhere.

```python
# Source: SQLAlchemy 2.0 async docs — https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html
# app/database.py

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

class Base(DeclarativeBase):
    pass

# Created once at module import time; engine is reused across all requests
engine = create_async_engine(
    get_settings().database_url,  # postgresql+asyncpg://user:pass@host:5432/dbname
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,           # Detect stale connections before use
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,       # Prevent detached-instance errors after commit
)
```

### Pattern 2: get_db Dependency

**What:** FastAPI dependency that yields an `AsyncSession` with automatic commit/rollback.

**When to use:** Inject into every route handler that needs DB access.

```python
# Source: FastAPI SQLAlchemy 2 async pattern — https://fastapi.tiangolo.com/tutorial/sql-databases/
# app/dependencies.py

from collections.abc import AsyncGenerator
from typing import Annotated
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session_maker

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

DbSession = Annotated[AsyncSession, Depends(get_db)]
```

**Critical:** Do NOT inject `DbSession` into the top-level WebSocket handler (Phase 2+). Sessions must be acquired and released per discrete operation within long-lived WebSocket loops — not held for the connection lifetime. This is established as a convention here and followed in subsequent phases.

### Pattern 3: pydantic-settings Configuration

**What:** Typed env var class with `.env` file loading; cached singleton via `@lru_cache`.

**When to use:** All configuration access throughout the application.

```python
# Source: pydantic-settings docs — https://docs.pydantic.dev/latest/concepts/pydantic_settings/
# app/config.py

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Database
    database_url: str  # postgresql+asyncpg://user:pass@host:5432/dbname

    # Auth
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30

    # Node auth
    server_token: str  # Static Bearer token nodes authenticate with

    # OpenAI
    openai_api_key: str

    # DB pool (make configurable for tuning)
    db_pool_size: int = 10
    db_max_overflow: int = 20

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

**Note:** `database_url` must use `postgresql+asyncpg://` scheme, not `postgresql://`. The `+asyncpg` dialect selector is what causes SQLAlchemy to use asyncpg as the driver.

### Pattern 4: SQLAlchemy 2 Models with Mapped[] Typing

**What:** Fully typed ORM models using `Mapped[type]` column declarations (SQLAlchemy 2.x API).

**When to use:** All six table models in this phase.

```python
# Source: SQLAlchemy 2.0 ORM — https://docs.sqlalchemy.org/en/20/orm/quickstart.html
# app/models/node.py

import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Enum as SAEnum, ARRAY, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class NodeStatus(str, enum.Enum):
    connected = "connected"
    stale = "stale"
    disconnected = "disconnected"

class Node(Base):
    __tablename__ = "nodes"

    node_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    platform: Mapped[str] = mapped_column(String(64))
    version: Mapped[str] = mapped_column(String(32))
    projects: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    team_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    status: Mapped[NodeStatus] = mapped_column(
        SAEnum(NodeStatus, name="node_status"),
        default=NodeStatus.disconnected
    )
    first_seen: Mapped[datetime] = mapped_column(server_default=func.now())
    connected_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    last_heartbeat: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    last_seen: Mapped[Optional[datetime]] = mapped_column(nullable=True)
```

### Pattern 5: Alembic with Async Engine (Critical Gotcha)

**What:** Alembic uses a SYNC database connection for migrations — even though the app uses an async engine. This is correct and expected.

**When to use:** Alembic `env.py` configuration.

```python
# Source: Alembic async migration docs — https://alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic
# alembic/env.py (async pattern)

import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

# Import all models so Alembic autogenerate detects them
from app.models import node, instance, user, team, audit  # noqa: F401
from app.database import Base

config = context.config
target_metadata = Base.metadata

def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # NullPool for migrations — no persistent connections
    )

    async def run_async_migrations() -> None:
        async with connectable.connect() as connection:
            await connection.run_sync(do_run_migrations)
        await connectable.dispose()

    asyncio.run(run_async_migrations())

def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()
```

**Important:** `NullPool` in Alembic `env.py` is intentional. Migrations are one-shot operations; a connection pool would hold open connections after the migration completes. Using `NullPool` ensures clean connection teardown.

### Pattern 6: FastAPI App with Lifespan

**What:** `asynccontextmanager` lifespan for startup/shutdown tasks (required by Phase 4 health monitor).

**When to use:** `app/main.py` — establish pattern now so health monitor plugs in cleanly.

```python
# Source: FastAPI lifespan — https://fastapi.tiangolo.com/advanced/events/
# app/main.py

from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.database import engine, Base

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: nothing yet — Alembic handles schema; engine is created at module import
    yield
    # Shutdown: dispose engine connection pool cleanly
    await engine.dispose()

app = FastAPI(title="GLSD Server", lifespan=lifespan)
```

**Why lifespan now:** Phase 4 adds a background task to the `lifespan` handler. If Phase 1 uses the deprecated `@app.on_event("startup")` pattern, Phase 4 would require a refactor. Setting up `lifespan` now means Phase 4 just adds one line.

### Pattern 7: Docker Compose Single-Worker Enforcement

**What:** `command:` in Docker Compose explicitly passes `--workers 1` to Gunicorn, overriding any defaults.

**When to use:** `docker-compose.yml` — the single-worker constraint must be enforced at the infrastructure level, not just documentation.

```yaml
# docker-compose.yml
services:
  api:
    build: ./backend
    command: >
      gunicorn app.main:app
      --workers 1
      --worker-class uvicorn.workers.UvicornWorker
      --bind 0.0.0.0:8000
      --timeout 120
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "8000:8000"

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

**Why `gunicorn` not `uvicorn` directly:** Gunicorn provides signal handling, graceful shutdown, and worker management. Uvicorn run directly is fine in development but Gunicorn is the production-correct wrapper. With `--workers 1` both achieve the same single-process constraint, but Gunicorn handles SIGTERM/SIGHUP correctly in container environments.

**Why `depends_on.condition: service_healthy`:** Without a health check condition, the API container starts before PostgreSQL is ready to accept connections. The `entrypoint.sh` runs `alembic upgrade head` on startup — if the DB isn't ready, migrations fail and the container crashes. The health check prevents the race.

### Pattern 8: Container Entrypoint with Migration

**What:** `entrypoint.sh` runs Alembic migrations before starting the application server. Ensures schema is always current on container startup.

```bash
#!/bin/bash
# backend/entrypoint.sh
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting application server..."
exec "$@"
```

```dockerfile
# backend/Dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]
CMD ["gunicorn", "app.main:app", "--workers", "1", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--timeout", "120"]
```

**The `exec "$@"` pattern:** `exec` replaces the shell process with the application process. This means the application receives signals (SIGTERM from Docker) correctly. Without `exec`, Docker sends SIGTERM to the bash process, not Gunicorn, and graceful shutdown doesn't work.

### Anti-Patterns to Avoid

- **Using `tiangolo/uvicorn-gunicorn-fastapi` Docker image:** This image auto-detects CPU cores and starts multiple workers. It will silently break the in-memory connection registry. Use `python:3.12-slim` as the base image and specify `--workers 1` explicitly.
- **Using `--workers $(nproc)` or `--workers 0` (auto):** Both will result in multiple workers. Always hardcode `--workers 1` in the Compose file.
- **Sync SQLAlchemy engine alongside async:** Never create `create_engine()` (sync) alongside `create_async_engine()`. Alembic migrations use async engine configured to run in a sync context via `asyncio.run()` — this is the only correct pattern for async + Alembic.
- **Storing secrets in `docker-compose.yml` directly:** Use `env_file: .env` in Compose; never paste secrets into the `environment:` section of the committed file.
- **Importing all models in `database.py`:** Import models in `alembic/env.py` for autogenerate detection, not in `database.py`. Circular imports will cause startup failures.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Environment variable parsing + validation | Custom `os.environ.get()` with manual type casting | `pydantic-settings` `BaseSettings` | Type coercion, validation errors, `.env` file loading, nested settings — all handled |
| Database migration management | Hand-written `CREATE TABLE` SQL scripts | Alembic | Version history, rollback support, autogenerate from SQLAlchemy models, concurrent migration safety |
| Connection pooling | Manual asyncpg connection management | SQLAlchemy `create_async_engine` with `pool_size`/`max_overflow` | Pool lifecycle, health checks (`pool_pre_ping`), overflow handling, proper async context management |
| Graceful shutdown | Manual signal handlers | Gunicorn + `exec "$@"` in entrypoint | Gunicorn handles SIGTERM, worker restart, timeout enforcement |
| DB schema drift detection | Comparing running schema to code | Alembic `alembic check` | Built-in; detects unapplied migrations |

**Key insight:** The foundation phase is all infrastructure that has been solved correctly by the ecosystem. The value is in wiring it together correctly the first time — not in custom implementations.

---

## Common Pitfalls

### Pitfall 1: Alembic Autogenerate Misses Tables

**What goes wrong:** Running `alembic revision --autogenerate` produces an empty migration or misses tables.

**Why it happens:** Alembic autogenerate only detects models that have been imported into `alembic/env.py` before `target_metadata` is read. If models are defined in separate files but not imported, their tables are invisible to autogenerate.

**How to avoid:** In `alembic/env.py`, explicitly import every model module before referencing `Base.metadata`:
```python
from app.models import node, instance, user, team, audit  # noqa: F401
from app.database import Base
target_metadata = Base.metadata
```

**Warning signs:** `alembic revision --autogenerate` produces a migration with an empty `upgrade()` function despite defined models.

---

### Pitfall 2: asyncpg URL Scheme Mismatch

**What goes wrong:** `sqlalchemy.exc.NoSuchModuleError: Can't load plugin: sqlalchemy.dialects:postgresql` at startup.

**Why it happens:** `DATABASE_URL=postgresql://...` uses the default (sync) psycopg2 dialect. asyncpg requires the `postgresql+asyncpg://` scheme.

**How to avoid:** Always use `postgresql+asyncpg://` in `DATABASE_URL`. Validate in the `Settings` class with a Pydantic validator:
```python
from pydantic import field_validator

@field_validator("database_url")
@classmethod
def validate_db_url(cls, v: str) -> str:
    if not v.startswith("postgresql+asyncpg://"):
        raise ValueError("database_url must use postgresql+asyncpg:// scheme")
    return v
```

**Warning signs:** `NoSuchModuleError` or `ModuleNotFoundError` referencing psycopg2 on startup.

---

### Pitfall 3: Migration Fails Because PostgreSQL Not Ready

**What goes wrong:** Container startup fails with `Connection refused` during `alembic upgrade head`.

**Why it happens:** Docker Compose `depends_on` without `condition: service_healthy` only waits for the container to *start*, not for PostgreSQL to *accept connections*. PostgreSQL takes 1-3 seconds to initialize.

**How to avoid:** Configure a `healthcheck` on the `db` service and use `condition: service_healthy` on the `api` service's `depends_on`. The health check uses `pg_isready`:
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
  interval: 5s
  timeout: 5s
  retries: 5
```

**Warning signs:** Migration failure log immediately after container start, followed by `Connection refused`.

---

### Pitfall 4: `expire_on_commit=False` Not Set

**What goes wrong:** `sqlalchemy.orm.exc.DetachedInstanceError: Instance <Node ...> is not bound to a Session` when accessing model attributes after an `await session.commit()`.

**Why it happens:** SQLAlchemy's default is `expire_on_commit=True` — after a commit, all attributes on the instance are expired and require a re-fetch. In async code where you commit then return the object, accessing any attribute triggers a lazy load. Lazy loads block the event loop in async SQLAlchemy.

**How to avoid:** Set `expire_on_commit=False` on `async_sessionmaker`:
```python
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
```

**Warning signs:** `DetachedInstanceError` in route handlers that return objects after commit.

---

### Pitfall 5: Multiple Uvicorn Workers Breaking In-Memory State

**What goes wrong:** Node connection registry silently splits across workers — commands dispatched from one worker can't find connections established on another.

**Why it happens:** If `--workers` is not explicitly set to `1`, Gunicorn may default to multiple workers, or auto-detection may scale up.

**How to avoid:** Hardcode `--workers 1` in both `docker-compose.yml` and the `Dockerfile` CMD. Never use `--workers $(nproc)` or `--workers 0`.

**Warning signs:** Nodes appear connected in logs but commands fail to reach them; frontend shows nodes as disconnected immediately after connecting.

---

### Pitfall 6: Alembic NullPool Omission

**What goes wrong:** After `alembic upgrade head` completes in `entrypoint.sh`, the process hangs because asyncpg connection pool connections remain open and prevent event loop shutdown.

**Why it happens:** `async_engine_from_config` with the default pool keeps connections alive. Migrations don't need a persistent pool.

**How to avoid:** Use `poolclass=pool.NullPool` in `alembic/env.py`:
```python
connectable = async_engine_from_config(
    config.get_section(config.config_ini_section, {}),
    prefix="sqlalchemy.",
    poolclass=pool.NullPool,
)
```

**Warning signs:** Entrypoint hangs after "Running database migrations..." log line.

---

## Code Examples

### All Six Table Models

```python
# Source: SQLAlchemy 2.0 ORM — https://docs.sqlalchemy.org/en/20/orm/
# app/models/instance.py

import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class InstanceStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    finished = "finished"
    errored = "errored"

class Instance(Base):
    __tablename__ = "instances"

    instance_id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    node_id: Mapped[str] = mapped_column(String(255), ForeignKey("nodes.node_id"))
    project: Mapped[str] = mapped_column(String(255))
    session_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[InstanceStatus] = mapped_column(
        SAEnum(InstanceStatus, name="instance_status"),
        default=InstanceStatus.pending
    )
    exit_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default="now()")
```

```python
# app/models/user.py

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class User(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
```

```python
# app/models/team.py

from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Team(Base):
    __tablename__ = "teams"

    team_id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    name: Mapped[str] = mapped_column(String(255))
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"))

class TeamMember(Base):
    __tablename__ = "team_members"

    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.team_id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(32), default="member")  # "owner" | "member"
```

```python
# app/models/audit.py

from datetime import datetime
from typing import Optional, Any
from sqlalchemy import String, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(server_default="now()", index=True)
    node_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    instance_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    event_type: Mapped[str] = mapped_column(String(64))
    details: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
```

### Health Endpoint (Phase 1 Smoke Test)

```python
# Source: FastAPI docs — https://fastapi.tiangolo.com/tutorial/first-steps/
# app/routers/health.py

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.dependencies import DbSession

router = APIRouter()

@router.get("/health")
async def health_check(db: DbSession):
    """Verifies FastAPI is running and database is reachable."""
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
```

### Environment File Template

```bash
# .env.example — commit this; .env is in .gitignore
DATABASE_URL=postgresql+asyncpg://glsd:glsd_password@db:5432/glsd
POSTGRES_DB=glsd
POSTGRES_USER=glsd
POSTGRES_PASSWORD=glsd_password

JWT_SECRET_KEY=change-me-in-production-use-openssl-rand-hex-32
SERVER_TOKEN=change-me-node-bearer-token

OPENAI_API_KEY=sk-...

DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `python-jose` for JWT | `PyJWT` 2.x | FastAPI migrated in 2024 (PR #11589) | python-jose has unpatched CVEs; PyJWT is actively maintained |
| `passlib` for password hashing | `pwdlib` | FastAPI migrated in 2024 | passlib broken with bcrypt >= 5.0.0 on Python 3.12+ |
| `python-dotenv` for env vars | `pydantic-settings` | pydantic v2 era (2023+) | Type safety, validation, and `.env` support in one package |
| SQLAlchemy 1.4 `Session.query()` style | SQLAlchemy 2.x `select()` style with `Mapped[]` | SQLAlchemy 2.0 (2023) | Fully typed columns; async-native from the start |
| `@app.on_event("startup")` | `asynccontextmanager` lifespan | FastAPI 0.93+ | Cleaner startup/shutdown; `on_event` is deprecated |
| `tiangolo/uvicorn-gunicorn-fastapi` Docker image | `python:3.12-slim` with explicit Gunicorn | Ongoing | Auto-scaling workers breaks in-memory state; explicit control required |
| Alembic sync migrations with sync engine | Alembic async migrations via `async_engine_from_config` + `asyncio.run()` | SQLAlchemy 2.0 async era | Required when the rest of the app uses async engine |

**Deprecated/outdated:**
- `python-jose`: Do not use. Abandoned, CVEs, FastAPI officially migrated away.
- `passlib`: Do not use. Abandoned, broken with bcrypt >= 5.0.0.
- `@app.on_event("startup")` / `@app.on_event("shutdown")`: Deprecated in FastAPI 0.93. Use `lifespan` context manager.
- `Session.query(Model).filter(...)`: SQLAlchemy 1.x legacy style. Use `select(Model).where(...)` with `await session.execute(...)`.

---

## Open Questions

1. **PostgreSQL `ARRAY(String)` for `projects` field**
   - What we know: PostgreSQL natively supports arrays; asyncpg handles them; SQLAlchemy `ARRAY` type works with asyncpg.
   - What's unclear: Whether Alembic autogenerate correctly handles `ARRAY(String)` for migration generation on first run.
   - Recommendation: Verify by running autogenerate locally; fall back to `JSON` column type if ARRAY autogenerate has issues (JSON is equally functional for a string list).

2. **`.env` file vs Docker secrets for production**
   - What we know: `env_file: .env` in Compose is correct for development. For production, Docker secrets or environment injection from a secrets manager is preferred.
   - What's unclear: The deployment target's production secrets strategy is not specified.
   - Recommendation: Use `env_file: .env` for v1 (it meets DEPLOY-03: no hardcoded values). Add a `.env.example` template file committed to the repo. Document that `.env` must never be committed.

3. **Database host reference in `DATABASE_URL` inside Docker Compose**
   - What we know: Inside Docker Compose, services communicate via service name as hostname. `db` is the correct hostname, not `localhost`.
   - What's unclear: Nothing — this is standard Docker Compose networking.
   - Recommendation: `DATABASE_URL=postgresql+asyncpg://user:pass@db:5432/dbname` where `db` is the Compose service name.

---

## Sources

### Primary (HIGH confidence)
- SQLAlchemy 2.0 async docs — https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html — AsyncSession, async engine, session factory patterns
- Alembic async cookbook — https://alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic — async migration pattern, NullPool usage
- FastAPI SQL databases docs — https://fastapi.tiangolo.com/tutorial/sql-databases/ — get_db dependency pattern
- FastAPI lifespan docs — https://fastapi.tiangolo.com/advanced/events/ — lifespan context manager
- pydantic-settings docs — https://docs.pydantic.dev/latest/concepts/pydantic_settings/ — BaseSettings, env_file, lru_cache
- FastAPI PyJWT migration PR #11589 — https://github.com/fastapi/fastapi/pull/11589 — PyJWT over python-jose confirmation
- passlib abandonment discussion — https://github.com/fastapi/fastapi/discussions/11773 — pwdlib over passlib confirmation
- `.planning/research/STACK.md` (in-repo) — complete stack decisions with rationale
- `.planning/research/ARCHITECTURE.md` (in-repo) — component boundaries and data flows
- `.planning/research/PITFALLS.md` (in-repo) — critical pitfalls and prevention strategies

### Secondary (MEDIUM confidence)
- FastAPI production deployment — https://fastapi.tiangolo.com/deployment/server-workers/ — Gunicorn + UvicornWorker pattern
- asyncpg PyPI — https://pypi.org/project/asyncpg/ — version and dialect string confirmation
- Docker Compose health check docs — https://docs.docker.com/compose/how-tos/startup-order/ — `depends_on` + `service_healthy` pattern

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified against CLAUDE.md project research conducted 2026-03-20; versions confirmed via official sources
- Architecture: HIGH — patterns derived from SQLAlchemy 2.x and FastAPI official docs; project's own architecture research is normative
- Pitfalls: HIGH — async/sync mismatch, Alembic autogenerate gaps, and multi-worker issues are documented failure modes with official references

**Research date:** 2026-03-20
**Valid until:** 2026-09-20 (stable stack; SQLAlchemy 2.x and FastAPI 0.1xx are stable release lines)
