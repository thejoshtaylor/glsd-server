# GLSD Server - Frontend

React dashboard for managing GSD nodes -- distributed agents running Claude CLI instances.
Provides real-time WebSocket streaming of command output, node status monitoring, execute
and kill controls, team management, audit logging, and voice-to-text prompt input.

## Tech Stack

| Technology       | Version | Purpose                                    |
| ---------------- | ------- | ------------------------------------------ |
| React            | 19      | UI framework                               |
| TypeScript       | 5.9     | Type safety                                |
| Vite             | 8       | Build tool and dev server                  |
| TanStack Router  | 1.x     | File-based client-side routing             |
| TanStack Query   | 5.x     | Server state management / REST data fetching |
| Zustand          | 5.x     | WebSocket connection and UI state          |
| shadcn/ui        | 4.x     | Copy-owned component library               |
| Tailwind CSS     | 4.x     | Utility-first CSS                          |
| Lucide React     | 1.x     | Icons                                      |
| Sonner           | 2.x     | Toast notifications                        |
| date-fns         | 4.x     | Date formatting                            |

## Prerequisites

- Node.js 22+
- A running backend API (either locally via `uvicorn` or via the Docker Compose stack)

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

The dev server starts at **http://localhost:5173**. Vite is configured to proxy API and
WebSocket requests to the backend:

- `/api/*` proxies to `http://localhost:8000`
- `/ws/*` proxies to `ws://localhost:8000`

This means the backend must be running on port 8000 for the frontend to function during
development. See the root README for backend setup instructions.

## Available Scripts

| Command           | Description                                       |
| ----------------- | ------------------------------------------------- |
| `npm run dev`     | Start Vite dev server with HMR (port 5173)        |
| `npm run build`   | Type-check with `tsc` then build for production   |
| `npm run lint`    | Run ESLint                                        |
| `npm run preview` | Preview production build locally                  |

## Project Structure

```
src/
  components/
    alerts/          # Alert/notification components
    audit/           # Audit log table and filters
    execute/         # Command execution form and controls
    nodes/           # Node list, node detail, status indicators
    stream/          # Live output streaming panel (NDJSON rendering)
    ui/              # shadcn/ui base components (copy-owned)
  hooks/
    useAutoScroll.ts   # Auto-scroll for streaming output panels
    useVoiceRecorder.ts # Browser mic input for voice-to-text
    useWebSocket.ts    # WebSocket connection lifecycle hook
  lib/
    api.ts           # Fetch wrapper for REST API calls
    queryClient.ts   # TanStack Query client configuration
    utils.ts         # Shared utility functions (cn, formatting)
  routes/
    __root.tsx       # Root layout (auth guard, sidebar, providers)
    index.tsx        # Landing / redirect
    login.tsx        # Login page
    dashboard/
      route.tsx      # Dashboard layout
      index.tsx      # Dashboard home (node overview)
      $nodeId.tsx    # Node detail page (instances, streaming)
      audit.tsx      # Audit log page
  stores/
    wsStore.ts       # Zustand store for WebSocket state and stream buffers
  types/
    api.ts           # API request/response TypeScript types
    ndjson.ts        # NDJSON content block type definitions
    protocol.ts      # GSD wire protocol message types
```

## Key Patterns

- **File-based routing** -- Routes are defined as files in `src/routes/` using TanStack
  Router conventions. The `@tanstack/router-plugin/vite` plugin generates route types
  automatically.

- **WebSocket state in Zustand** -- The WebSocket connection and live stream buffers are
  managed in a Zustand store (`wsStore`), not React component state. This keeps the
  connection stable across route navigations.

- **TanStack Query for REST** -- All REST API data fetching uses TanStack Query with
  automatic caching. WebSocket events invalidate query caches via
  `queryClient.setQueryData()` for real-time UI updates.

- **Copy-owned UI components** -- shadcn/ui components live in `src/components/ui/` and
  are checked into the repo. They are not installed as a package dependency.

- **Vite plugin order** -- `TanStackRouterVite()` must be listed before `react()` and
  `tailwindcss()` in the Vite plugins array. Incorrect ordering causes build failures.

- **Path alias** -- `@/` is aliased to `src/` for clean imports (e.g.,
  `import { Button } from '@/components/ui/button'`).

## Building for Production

```bash
npm run build
```

This runs TypeScript type-checking followed by a Vite production build. Output goes to
the `dist/` directory.

In the Docker deployment, a multi-stage build compiles the frontend and copies the output
into an Nginx container. Nginx serves the static files and proxies `/api/` and `/ws/`
requests to the backend API service. See `nginx.conf` and `Dockerfile` for details.
