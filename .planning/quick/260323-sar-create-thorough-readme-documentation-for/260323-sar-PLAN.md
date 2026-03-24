---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
  - frontend/README.md
autonomous: true
must_haves:
  truths:
    - "Developer can understand what GLSD Server is and its architecture from root README"
    - "Developer can set up the project locally using documented instructions"
    - "Developer can deploy with Docker Compose using documented steps"
    - "Developer can find all API endpoints and WebSocket protocol details"
    - "Frontend-specific setup is documented separately in frontend/README.md"
  artifacts:
    - path: "README.md"
      provides: "Comprehensive project documentation"
      min_lines: 200
    - path: "frontend/README.md"
      provides: "Frontend-specific development guide"
      min_lines: 80
  key_links: []
---

<objective>
Create thorough README documentation for the GLSD Server repository.

Purpose: The project shipped v1.0 MVP but has no real documentation beyond the auto-generated Vite template README in frontend/. Developers (and future-you) need clear docs covering what the project is, how to set it up, how to deploy it, and how the architecture works.

Output: Root README.md (comprehensive) + frontend/README.md (frontend-specific setup and development).
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/MILESTONES.md
@CLAUDE.md
@docker-compose.yml
@backend/app/config.py
@backend/app/main.py
@backend/requirements.txt
@frontend/package.json
@backend/Dockerfile
@frontend/Dockerfile
@frontend/nginx.conf
@backend/entrypoint.sh
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create root README.md</name>
  <files>README.md</files>
  <action>
Create a comprehensive README.md at the repository root. Structure it with these sections:

**Header:** Project name (GLSD Server), one-line description, then a brief paragraph explaining what it does (central management server for GSD nodes running Claude CLI).

**Architecture Overview:** Describe the three-service Docker Compose architecture (FastAPI API, Nginx+React frontend, PostgreSQL). Explain the two WebSocket endpoints (`/ws/node` for GSD nodes, `/ws/frontend` for browser clients). Mention the in-memory ConnectionManager with PostgreSQL persistence, EventRouter with asyncio queue fan-out, CommandBus for dispatch, and Health Monitor background task. Include a simple ASCII diagram showing: Nodes -> WS -> Server -> WS -> Browser Dashboard, with PostgreSQL on the side.

**Tech Stack:** Two sub-sections (Backend and Frontend). Backend: Python 3.12, FastAPI, SQLAlchemy 2.0 async, asyncpg, PostgreSQL 16, Alembic, PyJWT, pwdlib, OpenAI Whisper SDK. Frontend: React 19, TypeScript 5, Vite 8, TanStack Router, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4. Deployment: Docker Compose, Gunicorn + Uvicorn, Nginx.

**Prerequisites:** Python 3.12+, Node.js 22+, PostgreSQL 16+ (or Docker), Docker and Docker Compose (for deployment).

**Quick Start (Docker Compose):** Step-by-step: (1) Clone repo, (2) Create `.env` file from documented template with all required env vars, (3) `docker compose up --build`, (4) Access at http://localhost. Note that the entrypoint runs `alembic upgrade head` automatically on startup.

**Environment Variables:** Table listing every env var from `backend/app/config.py`:
- `DATABASE_URL` (required) - PostgreSQL connection string, MUST use `postgresql+asyncpg://` scheme. Example: `postgresql+asyncpg://glsd:glsd_password@db:5432/glsd`
- `JWT_SECRET_KEY` (required) - Secret for signing JWT tokens. Generate with `openssl rand -hex 32`
- `JWT_ALGORITHM` (default: HS256)
- `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` (default: 30)
- `JWT_REFRESH_TOKEN_EXPIRE_DAYS` (default: 7)
- `SERVER_TOKEN` (required) - Bearer token(s) for node authentication. Supports comma-separated values for rotation.
- `OPENAI_API_KEY` (required) - OpenAI API key for Whisper transcription
- `DB_POOL_SIZE` (default: 10)
- `DB_MAX_OVERFLOW` (default: 20)
- Plus the Docker Compose PostgreSQL vars: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`

Provide a complete `.env.example` block users can copy.

**Local Development:** Two sub-sections:
- Backend: Create venv, install requirements.txt, set env vars, run `alembic upgrade head`, run `uvicorn app.main:app --reload` from `backend/` dir.
- Frontend: `npm install` in `frontend/`, `npm run dev`, note the Vite proxy setup for API calls during development.

**API Endpoints:** Table with Method, Path, Auth, Description for all endpoints:
- `GET /health` - No auth - Health check
- `POST /api/auth/register` - No auth - Register user (creates personal team)
- `POST /api/auth/login` - No auth - Login, returns JWT tokens
- `POST /api/auth/refresh` - No auth - Refresh access token
- `POST /api/auth/logout` - JWT - Revoke refresh token
- `POST /api/auth/ws-ticket` - JWT - Get one-time WebSocket ticket
- `GET /api/auth/me` - JWT - Current user info
- `GET /api/nodes` - JWT - List nodes for current team
- `GET /api/nodes/{node_id}` - JWT - Get node details
- `GET /api/instances` - JWT - List instances for current team
- `GET /api/instances/{instance_id}` - JWT - Get instance details
- `GET /api/instances/{instance_id}/stream` - JWT - Get stream events for instance
- `POST /api/execute` - JWT - Execute command on a node
- `POST /api/instances/{instance_id}/kill` - JWT - Kill running instance
- `POST /api/teams` - JWT - Create team
- `GET /api/teams` - JWT - List user's teams
- `GET /api/teams/{team_id}` - JWT - Get team details
- `POST /api/teams/{team_id}/members` - JWT - Add member to team
- `GET /api/teams/{team_id}/members` - JWT - List team members
- `DELETE /api/teams/{team_id}/members/{user_id}` - JWT - Remove member
- `POST /api/teams/{team_id}/nodes` - JWT - Assign node to team
- `GET /api/teams/{team_id}/nodes` - JWT - List team's nodes
- `GET /api/audit` - JWT - Query audit log
- `POST /api/transcribe` - JWT - Transcribe audio via Whisper

**WebSocket Endpoints:** Document both:
- `/ws/node` - Node connections. Auth via Bearer token in query param or header during upgrade. Implements GSD wire protocol v1.2.0 with 10 message types. Reference `protocol-spec.md` for full protocol details.
- `/ws/frontend` - Browser connections. Auth via one-time ticket from `/api/auth/ws-ticket`. Receives real-time stream events for subscribed instances.

**Project Structure:** Tree showing the key directories:
```
glsd-server/
  backend/
    app/
      config.py          # Settings (pydantic-settings)
      database.py         # Async SQLAlchemy engine/session
      dependencies.py     # FastAPI dependency injection
      main.py             # App factory + lifespan
      models/             # SQLAlchemy ORM models
      routers/            # REST API endpoints
      schemas/            # Pydantic request/response schemas
      services/           # Business logic layer
      ws/                 # WebSocket handlers, protocol, managers
    alembic/              # Database migrations
    Dockerfile
    requirements.txt
  frontend/
    src/
      components/         # React components (nodes, stream, execute, audit, ui)
      hooks/              # Custom hooks (useWebSocket, useVoiceRecorder, useAutoScroll)
      lib/                # API client, query client, utils
      routes/             # TanStack Router file-based routes
      stores/             # Zustand stores (wsStore)
      types/              # TypeScript type definitions
    Dockerfile
    nginx.conf
  docker-compose.yml
  protocol-spec.md        # GSD wire protocol v1.2.0 specification
  server-spec.md          # Server specification
```

**Key Architecture Decisions:** Brief list of the most important decisions and why:
- Single Uvicorn worker (in-memory ConnectionManager)
- Auth before `websocket.accept()` on both endpoints
- Stream events not persisted to DB (forwarded via asyncio queues only)
- PyJWT + pwdlib (not python-jose/passlib which are abandoned)
- EventRouter asyncio queue pattern for decoupled fan-out

**License:** Leave a placeholder or omit if no license file exists.

Do NOT include emojis. Use clean, professional Markdown formatting. Aim for 250-350 lines.
  </action>
  <verify>
    <automated>test -f C:/DATA/CODE/glsd-server/README.md && wc -l C:/DATA/CODE/glsd-server/README.md | awk '{if ($1 >= 200) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  </verify>
  <done>Root README.md exists with 200+ lines covering all required sections: project overview, architecture, tech stack, setup, Docker deployment, env vars, API endpoints, WebSocket protocol, project structure, and key decisions.</done>
</task>

<task type="auto">
  <name>Task 2: Create frontend/README.md</name>
  <files>frontend/README.md</files>
  <action>
Replace the auto-generated Vite template README with a proper frontend-specific README. Structure:

**Header:** "GLSD Server - Frontend" with brief description (React dashboard for managing GSD nodes).

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, TanStack Router (file-based routing), TanStack Query (server state), Zustand (WebSocket/UI state), shadcn/ui + Tailwind CSS v4, Lucide React (icons), Sonner (toasts), date-fns.

**Prerequisites:** Node.js 22+, running backend API (either local or via Docker).

**Getting Started:**
1. `npm install`
2. `npm run dev` (starts Vite dev server, default http://localhost:5173)
3. Note: API calls proxy to backend — explain how Vite proxy is configured or how the API base URL works.

**Available Scripts:** `npm run dev`, `npm run build`, `npm run lint`, `npm run preview`.

**Project Structure:** Show the src/ directory tree with brief descriptions:
- `components/` - UI components organized by feature (nodes/, stream/, execute/, audit/, alerts/, ui/)
- `hooks/` - Custom React hooks (useWebSocket for WS connection, useVoiceRecorder for mic input, useAutoScroll for stream panels)
- `lib/` - API client (fetch wrapper), TanStack Query client config, utilities
- `routes/` - TanStack Router file-based routes (login, dashboard index, node detail, audit)
- `stores/` - Zustand stores (wsStore for WebSocket connection and stream state)
- `types/` - TypeScript type definitions (API types, NDJSON types, protocol types)

**Key Patterns:**
- File-based routing with TanStack Router (routes in `src/routes/`)
- WebSocket connection managed via Zustand store, not React state
- TanStack Query for REST data fetching with cache invalidation from WebSocket events
- shadcn/ui components are copy-owned in `src/components/ui/`

**Building for Production:** `npm run build` outputs to `dist/`. In Docker, Nginx serves the built files and proxies `/api/` and `/ws/` to the backend.

Keep it 80-120 lines. No emojis. Clean Markdown.
  </action>
  <verify>
    <automated>test -f C:/DATA/CODE/glsd-server/frontend/README.md && wc -l C:/DATA/CODE/glsd-server/frontend/README.md | awk '{if ($1 >= 80) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  </verify>
  <done>frontend/README.md exists with 80+ lines covering frontend tech stack, setup, scripts, project structure, key patterns, and production build instructions. The Vite template boilerplate has been replaced.</done>
</task>

</tasks>

<verification>
- Both README files render correctly as Markdown (no broken links or formatting)
- Root README covers all required sections: overview, architecture, tech stack, setup, Docker, env vars, API endpoints, WebSocket, project structure, decisions
- frontend/README.md covers frontend-specific development workflow
- No documentation files created outside of README.md files (no docs/ folder)
- No emojis used
</verification>

<success_criteria>
- README.md at repo root is 200+ lines with comprehensive project documentation
- frontend/README.md is 80+ lines with frontend-specific development guide
- A new developer could clone the repo and get running using only the README instructions
- All API endpoints and environment variables are documented
</success_criteria>

<output>
After completion, create `.planning/quick/260323-sar-create-thorough-readme-documentation-for/260323-sar-SUMMARY.md`
</output>
