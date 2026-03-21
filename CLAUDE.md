<!-- GSD:project-start source:PROJECT.md -->
## Project

**GLSD Server**

A central management server for GSD nodes — remote agents that run Claude CLI instances. The server accepts inbound WebSocket connections from nodes, dispatches commands (execute, kill, status), streams real-time output, and provides a full web dashboard for team-based management. It includes voice-to-text input via OpenAI Whisper so users can speak prompts that get transcribed and dispatched to nodes.

**Core Value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time — the command-and-control plane that makes remote Claude instances usable.

### Constraints

- **Tech stack**: Python FastAPI (backend), React (frontend), PostgreSQL (database)
- **Protocol compatibility**: Must implement the GSD wire protocol v1.2.0 exactly as specified — nodes are already deployed
- **Deployment**: Docker Compose for v1
- **Node behavior**: Nodes send WebSocket pings every 30s, expect pongs, reconnect with exponential backoff (500ms–30s) — server must handle all of this gracefully
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Backend Core
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Python | 3.12+ | Runtime | 3.12 is current LTS with performance improvements; 3.13 not yet widely validated in production ecosystem |
| FastAPI | 0.115+ (latest: 0.135.1) | ASGI web framework | First-class WebSocket support via Starlette; Pydantic v2 built-in; excellent async DI; handles both REST and WS on same port |
| Uvicorn | 0.32+ | ASGI server | The standard async ASGI server for FastAPI; uvloop backend gives free ~2x perf |
| Pydantic v2 | 2.x (bundled with FastAPI) | Request/response validation, settings | pydantic-settings replaces python-dotenv for typed env var handling |
| pydantic-settings | 2.x | Config/secrets management | Type-safe env var parsing with .env file support; `@lru_cache` on `get_settings()` |
### Database Layer
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | 16+ | Primary persistence | Decided in constraints; handles node/instance/user/team state across restarts |
| SQLAlchemy | 2.0.44+ | ORM + async session management | `sqlalchemy[asyncio]` with `AsyncSession` + `create_async_engine`; 2.x API is fully typed with `Mapped[]` columns |
| asyncpg | 0.31.0 | Async PostgreSQL driver | 5x faster than psycopg2, consistently outperforms psycopg3 under concurrent load; used as the asyncio dialect (`postgresql+asyncpg://`) |
| Alembic | 1.18.4 | Schema migrations | The SQLAlchemy migration tool; run `alembic upgrade head` at container startup before app starts |
### Authentication
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PyJWT | 2.x | JWT token creation and validation | Actively maintained; FastAPI has officially migrated their docs and full-stack template from python-jose to PyJWT (PR #11589). python-jose is abandoned (last release 2021) and has unpatched security issues |
| pwdlib | 0.2+ | Password hashing | FastAPI's current documentation now uses pwdlib over passlib; passlib is abandoned, broke with bcrypt 5.0.0 |
| python-multipart | 0.0.12+ | File upload parsing | Required by FastAPI for `UploadFile` — audio file uploads for Whisper transcription |
### WebSocket Architecture
| Component | Approach | Why |
|-----------|----------|-----|
| Node WebSocket endpoint | `/ws/node` — `WebSocket` in FastAPI route | Bearer token validated during HTTP upgrade handshake via query param or header at upgrade time |
| Frontend WebSocket endpoint | `/ws/frontend` — separate endpoint | Browser WebSocket API cannot send custom headers; use short-lived JWT in query param (`?token=...`) or first-message authentication pattern |
| Connection registry | In-memory `ConnectionManager` dict (`node_id -> WebSocket`) | Single-process deployment (v1 constraint); no Redis needed until horizontal scaling |
| Broadcast to frontend | Fan-out from `ConnectionManager` to subscribed frontend connections | Forward `stream_event` in real time; frontend subscribes to specific `instance_id` |
| Ping/pong | FastAPI/Starlette handles WebSocket pong automatically | Nodes send WS-level pings every 30s; Starlette's underlying websockets library responds to pings natively |
### OpenAI Whisper Integration
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| openai (Python SDK) | 1.x (latest: ~1.99.9) | Whisper API calls | Official SDK; provides `AsyncOpenAI` client for non-blocking transcription calls; use `client.audio.transcriptions.create(model="whisper-1", file=...)` |
### Frontend Core
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | 19.2.4 | UI framework | Decided in constraints; latest stable |
| TypeScript | 5.x | Type safety | Non-negotiable for a real-time system with complex message types; catches protocol errors at compile time |
| Vite | 8.x | Build tool | Current standard for React SPAs; 8.0 with Rolldown bundler is 10-30x faster builds; no reason to use CRA or webpack |
| TanStack Router | 1.x | Client-side routing | Recommended for interactive dashboards; full type safety for routes; superior to React Router v7 library mode which lacks type safety without framework mode |
| TanStack Query | 5.91.3 | Server state / REST data fetching | Handles REST calls (login, node list, instance history) with caching; integrates with WebSocket via `queryClient.setQueryData()` invalidation |
| Zustand | 5.0.12 | Client / WebSocket state | Lightweight; manages WebSocket connection state, live stream buffers, UI state; pairs cleanly with TanStack Query |
### Frontend UI
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | 4.x | Utility CSS | shadcn/ui components target Tailwind v4; updated CLI can scaffold v4 projects |
| shadcn/ui | current | Component library | Copy-owned components (not a package dependency); built for dashboards; excellent admin/table/dialog primitives |
### Deployment
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Docker | 24+ | Container runtime | Decided in constraints |
| Docker Compose | v2.x | Multi-container orchestration | Decided in constraints; single `docker-compose.yml` for server + PostgreSQL |
| Gunicorn | 23+ | Process manager | Wraps Uvicorn workers for production; use `gunicorn -k uvicorn.workers.UvicornWorker` |
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
## Installation
### Backend
# Core
# Production process manager
### Frontend
# Initialize shadcn/ui after Tailwind setup
## Key Architecture Notes for This Project
### Two WebSocket Endpoints, Two Auth Schemes
### WebSocket Auth for Browser Clients
### Async Session Pattern
# In dependencies.py
### Single-Worker Constraint
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
