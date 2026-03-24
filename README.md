# GLSD Server

Central management server for GSD nodes -- remote agents that run Claude CLI instances.

GLSD Server accepts inbound WebSocket connections from distributed GSD nodes, dispatches
commands (execute, kill, status), streams real-time output back to browser clients, and
provides a full web dashboard for team-based management. It includes voice-to-text input
via OpenAI Whisper so users can speak prompts that get transcribed and dispatched to nodes.

## Architecture Overview

GLSD Server runs as a three-service Docker Compose stack:

- **API** -- Python FastAPI application (Gunicorn + Uvicorn) handling REST endpoints and
  WebSocket connections
- **Frontend** -- React SPA served by Nginx, which also reverse-proxies `/api/` and `/ws/`
  to the API service
- **Database** -- PostgreSQL 16 for persistent state (nodes, instances, users, teams, audit log)

The server maintains two WebSocket endpoints:

- `/ws/node` -- GSD nodes connect here with Bearer token auth. Implements the full GSD wire
  protocol v1.2.0 (10 message types).
- `/ws/frontend` -- Browser clients connect here with a one-time JWT ticket. Receives
  real-time stream events for subscribed instances.

Key internal components:

- **ConnectionManager** -- In-memory registry mapping `node_id` to WebSocket connections, with
  PostgreSQL persistence for node metadata
- **EventRouter** -- Internal message bus using per-connection asyncio queues with dedicated
  writer coroutines for decoupled fan-out
- **CommandBus** -- Validates node connectivity and team ownership before dispatching commands
- **Health Monitor** -- Background task scanning every 30s, marking nodes stale after 90s of
  no heartbeat

```
                          +-------------------+
  GSD Nodes ----WS----->>|                   |<<----WS---- Browser Dashboard
  (Claude CLI)           |   GLSD Server     |             (React SPA)
                         |   (FastAPI)       |
                         +--------+----------+
                                  |
                                  v
                          +-------+--------+
                          |  PostgreSQL 16  |
                          +----------------+
```

## Tech Stack

### Backend

| Technology               | Version | Purpose                         |
| ------------------------ | ------- | ------------------------------- |
| Python                   | 3.12+   | Runtime                         |
| FastAPI                  | 0.115+  | ASGI web framework              |
| SQLAlchemy               | 2.0+    | Async ORM (`sqlalchemy[asyncio]`) |
| asyncpg                  | 0.31+   | Async PostgreSQL driver          |
| PostgreSQL               | 16+     | Primary database                |
| Alembic                  | 1.18+   | Database migrations             |
| PyJWT                    | 2.9+    | JWT token handling              |
| pwdlib (argon2)          | 0.2+    | Password hashing                |
| OpenAI Python SDK        | 1.50+   | Whisper transcription           |
| Gunicorn                 | 23+     | Production process manager      |
| Uvicorn                  | 0.32+   | ASGI server                     |

### Frontend

| Technology       | Version | Purpose                          |
| ---------------- | ------- | -------------------------------- |
| React            | 19      | UI framework                     |
| TypeScript       | 5.9     | Type safety                      |
| Vite             | 8       | Build tool                       |
| TanStack Router  | 1.x     | File-based routing               |
| TanStack Query   | 5.x     | Server state / REST data fetching |
| Zustand          | 5.x     | WebSocket and UI state           |
| shadcn/ui        | 4.x     | Component library (copy-owned)   |
| Tailwind CSS     | 4.x     | Utility CSS                      |
| Lucide React     | 1.x     | Icons                            |
| Sonner           | 2.x     | Toast notifications              |
| date-fns         | 4.x     | Date formatting                  |

### Deployment

| Technology       | Purpose                                    |
| ---------------- | ------------------------------------------ |
| Docker Compose   | Multi-container orchestration              |
| Gunicorn         | Wraps Uvicorn workers for production       |
| Nginx            | Serves frontend, proxies API and WebSocket |

## Prerequisites

- Python 3.12+
- Node.js 22+
- PostgreSQL 16+ (or use the Docker Compose stack)
- Docker and Docker Compose (for deployment)

## Quick Start (Docker Compose)

1. Clone the repository:

   ```bash
   git clone <repo-url> glsd-server
   cd glsd-server
   ```

2. Create a `.env` file in the project root (see Environment Variables below for all options):

   ```bash
   cp .env.example .env   # or create manually from the template below
   ```

3. Build and start all services:

   ```bash
   docker compose up --build
   ```

4. Access the dashboard at **http://localhost**.

The backend entrypoint automatically runs `alembic upgrade head` on startup, so the
database schema is created/migrated before the application starts.

## Environment Variables

All backend configuration is managed via environment variables (loaded by pydantic-settings).

| Variable                          | Required | Default       | Description                                                                 |
| --------------------------------- | -------- | ------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`                    | Yes      | --            | PostgreSQL connection string. Must use `postgresql+asyncpg://` scheme.      |
| `JWT_SECRET_KEY`                  | Yes      | --            | Secret for signing JWT tokens. Generate with `openssl rand -hex 32`.        |
| `JWT_ALGORITHM`                   | No       | `HS256`       | JWT signing algorithm.                                                      |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | No       | `30`          | Access token lifetime in minutes.                                           |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS`   | No       | `7`           | Refresh token lifetime in days.                                             |
| `SERVER_TOKEN`                    | Yes      | --            | Bearer token(s) for node auth. Comma-separated for rotation.               |
| `OPENAI_API_KEY`                  | Yes      | --            | OpenAI API key for Whisper transcription.                                   |
| `DB_POOL_SIZE`                    | No       | `10`          | SQLAlchemy connection pool size.                                            |
| `DB_MAX_OVERFLOW`                 | No       | `20`          | SQLAlchemy max overflow connections.                                        |
| `POSTGRES_DB`                     | No       | `glsd`        | PostgreSQL database name (Docker Compose).                                  |
| `POSTGRES_USER`                   | No       | `glsd`        | PostgreSQL user (Docker Compose).                                           |
| `POSTGRES_PASSWORD`               | No       | `glsd_password` | PostgreSQL password (Docker Compose).                                     |

### .env.example

```env
# Database
DATABASE_URL=postgresql+asyncpg://glsd:glsd_password@db:5432/glsd

# Auth
JWT_SECRET_KEY=change-me-generate-with-openssl-rand-hex-32
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# Node authentication
SERVER_TOKEN=change-me-use-a-strong-random-token

# OpenAI (for Whisper transcription)
OPENAI_API_KEY=sk-your-openai-api-key

# DB pool tuning (optional)
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20

# PostgreSQL container (Docker Compose)
POSTGRES_DB=glsd
POSTGRES_USER=glsd
POSTGRES_PASSWORD=glsd_password
```

## Local Development

### Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables (or create a .env file in backend/)
export DATABASE_URL="postgresql+asyncpg://glsd:glsd_password@localhost:5432/glsd"
export JWT_SECRET_KEY="dev-secret-key"
export SERVER_TOKEN="dev-token"
export OPENAI_API_KEY="sk-your-key"

# Run database migrations
alembic upgrade head

# Start the development server
uvicorn app.main:app --reload
```

The API will be available at http://localhost:8000.

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will be available at http://localhost:5173. The Vite dev server is configured
to proxy `/api/` requests to `http://localhost:8000` and `/ws/` WebSocket connections to
`ws://localhost:8000`, so the backend must be running for the frontend to function.

## API Endpoints

All REST endpoints are prefixed with `/api`. Authentication uses JWT Bearer tokens unless
noted otherwise.

### Health

| Method | Path      | Auth | Description  |
| ------ | --------- | ---- | ------------ |
| GET    | `/health` | No   | Health check |

### Authentication

| Method | Path                  | Auth | Description                        |
| ------ | --------------------- | ---- | ---------------------------------- |
| POST   | `/api/auth/register`  | No   | Register user (creates personal team) |
| POST   | `/api/auth/login`     | No   | Login, returns JWT tokens          |
| POST   | `/api/auth/refresh`   | No   | Refresh access token               |
| POST   | `/api/auth/logout`    | JWT  | Revoke refresh token               |
| POST   | `/api/auth/ws-ticket` | JWT  | Get one-time WebSocket ticket      |
| GET    | `/api/auth/me`        | JWT  | Current user info                  |

### Nodes and Instances

| Method | Path                                  | Auth | Description                      |
| ------ | ------------------------------------- | ---- | -------------------------------- |
| GET    | `/api/nodes`                          | JWT  | List nodes for current team      |
| GET    | `/api/nodes/{node_id}`                | JWT  | Get node details                 |
| GET    | `/api/instances`                      | JWT  | List instances for current team  |
| GET    | `/api/instances/{instance_id}`        | JWT  | Get instance details             |
| GET    | `/api/instances/{instance_id}/stream` | JWT  | Get stream events for instance   |
| POST   | `/api/execute`                        | JWT  | Execute command on a node        |
| POST   | `/api/instances/{instance_id}/kill`   | JWT  | Kill running instance            |

### Teams

| Method | Path                                     | Auth | Description            |
| ------ | ---------------------------------------- | ---- | ---------------------- |
| POST   | `/api/teams`                             | JWT  | Create team            |
| GET    | `/api/teams`                             | JWT  | List user's teams      |
| GET    | `/api/teams/{team_id}`                   | JWT  | Get team details       |
| POST   | `/api/teams/{team_id}/members`           | JWT  | Add member to team     |
| GET    | `/api/teams/{team_id}/members`           | JWT  | List team members      |
| DELETE | `/api/teams/{team_id}/members/{user_id}` | JWT  | Remove member          |
| POST   | `/api/teams/{team_id}/nodes`             | JWT  | Assign node to team    |
| GET    | `/api/teams/{team_id}/nodes`             | JWT  | List team's nodes      |

### Audit and Transcription

| Method | Path             | Auth | Description                      |
| ------ | ---------------- | ---- | -------------------------------- |
| GET    | `/api/audit`     | JWT  | Query audit log                  |
| POST   | `/api/transcribe`| JWT  | Transcribe audio via Whisper     |

## WebSocket Endpoints

### /ws/node -- Node Connections

GSD nodes connect to this endpoint. Authentication is via Bearer token in query parameter
or header during the WebSocket upgrade handshake.

This endpoint implements the GSD wire protocol v1.2.0 with 10 message types covering:
node registration, instance lifecycle events, stream data forwarding, command dispatch
(execute, kill, status), state reconciliation on reconnect, and heartbeat monitoring.

See `protocol-spec.md` for the full protocol specification.

### /ws/frontend -- Browser Connections

Browser clients connect to this endpoint. Authentication uses a one-time ticket obtained
from `POST /api/auth/ws-ticket` (passed as a query parameter during WebSocket upgrade).

Once connected, clients receive real-time stream events for subscribed instances, enabling
live output streaming in the dashboard.

## Project Structure

```
glsd-server/
  backend/
    app/
      config.py            # Settings (pydantic-settings)
      database.py           # Async SQLAlchemy engine/session
      dependencies.py       # FastAPI dependency injection
      main.py               # App factory + lifespan
      models/               # SQLAlchemy ORM models
      routers/              # REST API endpoints
      schemas/              # Pydantic request/response schemas
      services/             # Business logic layer
      ws/                   # WebSocket handlers, protocol, managers
    alembic/                # Database migrations
    entrypoint.sh           # Runs migrations before app start
    Dockerfile
    requirements.txt
  frontend/
    src/
      components/           # React components (nodes, stream, execute, audit, alerts, ui)
      hooks/                # Custom hooks (useWebSocket, useVoiceRecorder, useAutoScroll)
      lib/                  # API client, query client, utils
      routes/               # TanStack Router file-based routes
      stores/               # Zustand stores (wsStore)
      types/                # TypeScript type definitions
    Dockerfile
    nginx.conf
  docker-compose.yml
  protocol-spec.md          # GSD wire protocol v1.2.0 specification
  server-spec.md            # Server specification
```

## Key Architecture Decisions

- **Single Uvicorn worker** -- The in-memory ConnectionManager cannot be shared across
  processes. Docker Compose enforces `--workers 1`. Horizontal scaling requires migrating
  to Redis-backed pub/sub (planned for v2).

- **Auth before websocket.accept()** -- Both `/ws/node` (Bearer token) and `/ws/frontend`
  (JWT ticket) validate credentials before accepting the WebSocket upgrade. This prevents
  unauthenticated connections from consuming server resources.

- **Stream events not persisted to DB** -- Only terminal state transitions (instance
  finished/errored) are written to PostgreSQL. Stream events are forwarded to frontend
  clients via asyncio queues only. This keeps write volume manageable.

- **PyJWT + pwdlib** -- python-jose and passlib are abandoned libraries with unpatched
  security issues. PyJWT 2.x and pwdlib are their actively maintained replacements.

- **EventRouter asyncio queue pattern** -- Per-connection asyncio queues with dedicated
  writer coroutines decouple message routing from network I/O. The EventRouter never
  calls `websocket.send_text()` directly.

- **Team-based multi-tenancy** -- All data access is scoped by team. Users can belong to
  multiple teams. Nodes are assigned to exactly one team.
