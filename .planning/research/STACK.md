# Technology Stack

**Project:** GLSD Server — WebSocket command-and-control plane for distributed Claude CLI nodes
**Researched:** 2026-03-20
**Overall confidence:** HIGH (core stack verified via official docs and multiple sources)

---

## Recommended Stack

### Backend Core

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Python | 3.12+ | Runtime | 3.12 is current LTS with performance improvements; 3.13 not yet widely validated in production ecosystem |
| FastAPI | 0.115+ (latest: 0.135.1) | ASGI web framework | First-class WebSocket support via Starlette; Pydantic v2 built-in; excellent async DI; handles both REST and WS on same port |
| Uvicorn | 0.32+ | ASGI server | The standard async ASGI server for FastAPI; uvloop backend gives free ~2x perf |
| Pydantic v2 | 2.x (bundled with FastAPI) | Request/response validation, settings | pydantic-settings replaces python-dotenv for typed env var handling |
| pydantic-settings | 2.x | Config/secrets management | Type-safe env var parsing with .env file support; `@lru_cache` on `get_settings()` |

**Why FastAPI over Flask/Django:** FastAPI's async-native design is mandatory here. The server must hold thousands of long-lived WebSocket connections concurrently. A synchronous framework would block on every DB call. FastAPI's DI system is also ideal for scoping async DB sessions per request.

### Database Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | 16+ | Primary persistence | Decided in constraints; handles node/instance/user/team state across restarts |
| SQLAlchemy | 2.0.44+ | ORM + async session management | `sqlalchemy[asyncio]` with `AsyncSession` + `create_async_engine`; 2.x API is fully typed with `Mapped[]` columns |
| asyncpg | 0.31.0 | Async PostgreSQL driver | 5x faster than psycopg2, consistently outperforms psycopg3 under concurrent load; used as the asyncio dialect (`postgresql+asyncpg://`) |
| Alembic | 1.18.4 | Schema migrations | The SQLAlchemy migration tool; run `alembic upgrade head` at container startup before app starts |

**Why asyncpg over psycopg3:** For a server holding concurrent WebSocket connections, asyncpg's performance advantage is meaningful. Benchmarks show asyncpg 2-5x faster under high concurrency. psycopg3 has a nicer API but the performance delta is worth it for a real-time system.

**Why SQLAlchemy over SQLModel:** SQLModel (by the FastAPI author) is convenient for simple CRUD but has less battle-tested async support and lags behind SQLAlchemy on complex query patterns. Use SQLAlchemy directly with Pydantic schemas for API layer separation.

### Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PyJWT | 2.x | JWT token creation and validation | Actively maintained; FastAPI has officially migrated their docs and full-stack template from python-jose to PyJWT (PR #11589). python-jose is abandoned (last release 2021) and has unpatched security issues |
| pwdlib | 0.2+ | Password hashing | FastAPI's current documentation now uses pwdlib over passlib; passlib is abandoned, broke with bcrypt 5.0.0 |
| python-multipart | 0.0.12+ | File upload parsing | Required by FastAPI for `UploadFile` — audio file uploads for Whisper transcription |

**CRITICAL: Do NOT use python-jose.** It is unmaintained, has known security vulnerabilities, and FastAPI has officially replaced it. **Do NOT use passlib.** It is abandoned and broken with bcrypt >= 5.0.0 under Python 3.12+. Both are still referenced in older tutorials — verify you are using PyJWT + pwdlib.

**Node token auth vs JWT:** Nodes authenticate with a static `SERVER_TOKEN` (Bearer token, validated against env var or database). Frontend users get JWT tokens (short-lived access + refresh). These are two separate auth mechanisms on the same server — keep them in separate middleware/dependency paths.

### WebSocket Architecture

| Component | Approach | Why |
|-----------|----------|-----|
| Node WebSocket endpoint | `/ws/node` — `WebSocket` in FastAPI route | Bearer token validated during HTTP upgrade handshake via query param or header at upgrade time |
| Frontend WebSocket endpoint | `/ws/frontend` — separate endpoint | Browser WebSocket API cannot send custom headers; use short-lived JWT in query param (`?token=...`) or first-message authentication pattern |
| Connection registry | In-memory `ConnectionManager` dict (`node_id -> WebSocket`) | Single-process deployment (v1 constraint); no Redis needed until horizontal scaling |
| Broadcast to frontend | Fan-out from `ConnectionManager` to subscribed frontend connections | Forward `stream_event` in real time; frontend subscribes to specific `instance_id` |
| Ping/pong | FastAPI/Starlette handles WebSocket pong automatically | Nodes send WS-level pings every 30s; Starlette's underlying websockets library responds to pings natively |

**Why no Redis/broadcaster for v1:** The spec explicitly scopes to single-instance Docker Compose deployment. An in-memory connection manager is correct here. When horizontal scaling is needed, switch to `encode/broadcaster` with Redis pub/sub — architect the `ConnectionManager` as a replaceable interface from day one.

### OpenAI Whisper Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| openai (Python SDK) | 1.x (latest: ~1.99.9) | Whisper API calls | Official SDK; provides `AsyncOpenAI` client for non-blocking transcription calls; use `client.audio.transcriptions.create(model="whisper-1", file=...)` |

**Pattern:** REST endpoint `POST /api/transcribe` accepts audio via `UploadFile`, reads bytes, calls `AsyncOpenAI().audio.transcriptions.create()`, returns transcribed text. Never buffer large audio in memory — use `await file.read()` and pass bytes directly. Set a 25 MB upload limit guard.

**Model choice:** Use `whisper-1` as specified. The newer `gpt-4o-transcribe` models exist but are not required by spec; stick to `whisper-1` to match spec exactly.

### Frontend Core

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | 19.2.4 | UI framework | Decided in constraints; latest stable |
| TypeScript | 5.x | Type safety | Non-negotiable for a real-time system with complex message types; catches protocol errors at compile time |
| Vite | 8.x | Build tool | Current standard for React SPAs; 8.0 with Rolldown bundler is 10-30x faster builds; no reason to use CRA or webpack |
| TanStack Router | 1.x | Client-side routing | Recommended for interactive dashboards; full type safety for routes; superior to React Router v7 library mode which lacks type safety without framework mode |
| TanStack Query | 5.91.3 | Server state / REST data fetching | Handles REST calls (login, node list, instance history) with caching; integrates with WebSocket via `queryClient.setQueryData()` invalidation |
| Zustand | 5.0.12 | Client / WebSocket state | Lightweight; manages WebSocket connection state, live stream buffers, UI state; pairs cleanly with TanStack Query |

**State split:** TanStack Query owns all REST-fetched server state (paginated node lists, instance history, user/team data). Zustand owns real-time WebSocket state (live connection registry, active stream buffers, pending commands). This prevents the query cache from fighting the WebSocket push updates.

### Frontend UI

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | 4.x | Utility CSS | shadcn/ui components target Tailwind v4; updated CLI can scaffold v4 projects |
| shadcn/ui | current | Component library | Copy-owned components (not a package dependency); built for dashboards; excellent admin/table/dialog primitives |

**Why shadcn/ui over MUI/Chakra:** shadcn/ui components are owned in your codebase — no version conflicts, no breaking upgrades from upstream. Ideal for a dashboard with bespoke real-time UI needs. The Shadcn Admin template provides a ready-made starting point.

### Deployment

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Docker | 24+ | Container runtime | Decided in constraints |
| Docker Compose | v2.x | Multi-container orchestration | Decided in constraints; single `docker-compose.yml` for server + PostgreSQL |
| Gunicorn | 23+ | Process manager | Wraps Uvicorn workers for production; use `gunicorn -k uvicorn.workers.UvicornWorker` |

**Worker count for v1:** 1 Uvicorn worker. This server holds stateful in-memory WebSocket connections in a `ConnectionManager`. Multiple workers would split the connection registry — Node A's WebSocket would land on worker 1, a frontend client watching Node A might land on worker 2, and the broadcast would miss. For single-process v1, run one worker. When scaling horizontally, migrate to Redis pub/sub first.

**TLS termination:** Use a reverse proxy (nginx or Caddy) in front of Uvicorn. Never expose Uvicorn directly to the internet. The `wss://` requirement from the protocol spec is satisfied by the proxy layer.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| JWT library | PyJWT 2.x | python-jose | Abandoned since 2021, unpatched CVEs, FastAPI officially migrated away |
| Password hashing | pwdlib | passlib | Abandoned, broken with bcrypt >= 5.0.0 on Python 3.12+ |
| DB driver | asyncpg | psycopg3 | asyncpg is 2-5x faster under concurrent async load; psycopg3's nicer API doesn't outweigh perf delta |
| ORM | SQLAlchemy 2.x | SQLModel | SQLModel is convenient but less mature async support; SQLAlchemy is the ecosystem standard |
| Frontend routing | TanStack Router | React Router v7 | React Router v7 type safety only works in framework/SSR mode; TanStack Router is fully typed in SPA mode |
| Frontend state | Zustand + TanStack Query | Redux Toolkit | RTK is heavier; Zustand is idiomatic for WebSocket state; TanStack Query covers server state better than Redux |
| Build tool | Vite 8 | webpack/CRA | Vite 8 is 10-30x faster builds; CRA is deprecated |
| Component library | shadcn/ui + Tailwind | MUI / Chakra | shadcn/ui is copy-owned (no upstream breakage risk); ideal for dashboard customization |
| Pub/sub (v2+) | Redis + encode/broadcaster | In-memory | Not needed for single-instance v1; design `ConnectionManager` as interface so it's swappable |

---

## Installation

### Backend

```bash
# Core
pip install "fastapi[standard]>=0.115.0"
pip install "sqlalchemy[asyncio]>=2.0.44"
pip install "asyncpg>=0.31.0"
pip install "alembic>=1.18.0"
pip install "PyJWT>=2.9.0"
pip install "pwdlib[argon2]>=0.2.0"
pip install "python-multipart>=0.0.12"
pip install "openai>=1.50.0"
pip install "pydantic-settings>=2.6.0"
pip install "uvicorn[standard]>=0.32.0"

# Production process manager
pip install "gunicorn>=23.0.0"
```

### Frontend

```bash
npm create vite@latest dashboard -- --template react-ts
cd dashboard
npm install @tanstack/react-router @tanstack/react-query zustand
npm install -D tailwindcss @types/react @types/react-dom
# Initialize shadcn/ui after Tailwind setup
npx shadcn@latest init
```

---

## Key Architecture Notes for This Project

### Two WebSocket Endpoints, Two Auth Schemes

```
/ws/node      — nodes connect here, Bearer token from SERVER_TOKEN env var
/ws/frontend  — browser connects here, short-lived JWT in ?token= query param
```

Keep these as separate FastAPI route handlers with separate auth logic. Do not mix them.

### WebSocket Auth for Browser Clients

Browser WebSocket API cannot send `Authorization` headers. Use the two-step pattern:
1. `POST /api/auth/ws-token` with JWT cookie/header — returns a short-lived (60s) one-time WebSocket ticket
2. Frontend connects: `ws://server/ws/frontend?token={ticket}`
3. Server validates ticket, upgrades connection, discards ticket

### Async Session Pattern

```python
# In dependencies.py
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

Use `Annotated[AsyncSession, Depends(get_db)]` on all route handlers. Never create sessions manually inside route handlers.

### Single-Worker Constraint

The in-memory `ConnectionManager` (node_id -> WebSocket mapping) is the central state bus. This ONLY works correctly with a single Uvicorn worker. Document this prominently. When moving beyond v1, the connection registry must be externalized to Redis before adding workers.

---

## Sources

- FastAPI official docs: https://fastapi.tiangolo.com/advanced/websockets/
- FastAPI JWT migration to PyJWT (official PR): https://github.com/fastapi/fastapi/pull/11589
- FastAPI full-stack template PyJWT migration: https://github.com/fastapi/full-stack-fastapi-template/pull/1203
- passlib abandonment discussion: https://github.com/fastapi/fastapi/discussions/11773
- SQLAlchemy 2.0 async docs: https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html
- asyncpg PyPI: https://pypi.org/project/asyncpg/
- SQLAlchemy 2.0.44 release: https://github.com/sqlalchemy/sqlalchemy/releases/tag/rel_2_0_44
- Alembic docs: https://alembic.sqlalchemy.org/en/latest/front.html
- FastAPI WebSocket auth patterns: https://dev.to/hamurda/how-i-solved-websocket-authentication-in-fastapi-and-why-depends-wasnt-enough-1b68
- TanStack Router vs React Router for dashboards: https://medium.com/ekino-france/tanstack-router-vs-react-router-v7-32dddc4fcd58
- Zustand v5 release: https://pmnd.rs/blog/announcing-zustand-v5
- TanStack Query + WebSocket pattern: https://blog.logrocket.com/tanstack-query-websockets-real-time-react-data-fetching/
- OpenAI Whisper API: https://platform.openai.com/docs/api-reference/audio/createTranscription
- Vite 8 release: https://vite.dev/releases
- shadcn/ui with Tailwind v4: https://ui.shadcn.com/docs/tailwind-v4
- asyncpg vs psycopg comparison: https://fernandoarteaga.dev/blog/psycopg-vs-asyncpg/
- WebSocket scaling with Redis: https://medium.com/@philipokiokio/broadcasting-websockets-messages-across-instances-and-workers-with-fastapi-9a66d42cb30a
- FastAPI production deployment: https://fastapi.tiangolo.com/deployment/server-workers/
