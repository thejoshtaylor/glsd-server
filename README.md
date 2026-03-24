# GLSD Server

Central management server for GSD nodes — remote agents that run Claude CLI instances. Accepts WebSocket connections from nodes, dispatches commands (execute, kill, status), streams real-time output, and provides a web dashboard for team-based management.

## Tech Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2 (async), asyncpg, PostgreSQL 16
- **Frontend:** React 19, TanStack Router, TanStack Query, Zustand, shadcn/ui, Tailwind v4
- **Reverse Proxy:** Nginx
- **Deployment:** Docker Compose

## Prerequisites

- Docker and Docker Compose
- A `.env` file in the project root (see below)

## Quick Start

```bash
# Copy the example env file and edit values
cp .env.example .env

# Build and start all services
docker compose up --build
```

This starts three services:

| Service | Description |
|---------|-------------|
| **api** | FastAPI backend (port 8000, internal) |
| **frontend** | React SPA served by Nginx (port 80, internal) |
| **db** | PostgreSQL 16 database (port 5432, internal) |

Database migrations run automatically on startup via the backend entrypoint.

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (`postgresql+asyncpg://...`) |
| `POSTGRES_DB` | Yes | Database name for the PostgreSQL container |
| `POSTGRES_USER` | Yes | Database user for the PostgreSQL container |
| `POSTGRES_PASSWORD` | Yes | Database password for the PostgreSQL container |
| `JWT_SECRET_KEY` | Yes | Secret for signing JWT tokens — generate with `openssl rand -hex 32` |
| `SERVER_TOKEN` | Yes | Bearer token that GSD nodes use to authenticate |
| `OPENAI_API_KEY` | Yes | OpenAI API key for Whisper voice transcription |
| `DB_POOL_SIZE` | No | SQLAlchemy connection pool size (default: 10) |
| `DB_MAX_OVERFLOW` | No | SQLAlchemy max overflow connections (default: 20) |

## Project Structure

```
├── backend/           # FastAPI application
│   ├── app/           # Application source code
│   ├── alembic/       # Database migrations
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/          # React SPA
│   ├── src/           # Frontend source code
│   ├── nginx.conf     # Nginx reverse proxy config
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── protocol-spec.md   # GSD node wire protocol specification (v1.2.0)
└── server-spec.md     # Server backend specification
```

## Architecture

- **Two WebSocket endpoints:** `/ws/node` (GSD nodes) and `/ws/frontend` (browser clients)
- **Node auth:** Bearer token validated before WebSocket upgrade
- **Frontend auth:** JWT-based with ticket exchange for WebSocket connections
- **Event routing:** Internal asyncio queue-based fan-out, team-scoped
- **Health monitoring:** Background task scans every 30s, marks nodes stale after 90s

See [protocol-spec.md](protocol-spec.md) for the wire protocol and [server-spec.md](server-spec.md) for the server specification.
