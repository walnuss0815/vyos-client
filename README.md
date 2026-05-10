# VyOS Config Client

A Docker-ready Single Page Application for managing a VyOS router through the official VyOS HTTP API.

## Architecture

- **Frontend** — React, TypeScript, Vite, TanStack Query, Zustand, Zod
- **Backend** — Express.js acting as a Backend-for-Frontend (BFF) proxy
- **Container** — Single multi-stage Docker image; one service in Compose
- **Configuration** — 12-factor: all secrets and runtime config via environment variables

## Node Model

The UI represents the VyOS configuration as a tree of **nodes**. Every element in the tree — whether it contains children or holds a scalar value — is a node. Nodes are only shown when they exist in the running configuration. New nodes are created locally as drafts and only applied to VyOS when you press **Commit**.

## Action Bar

| Button | Behaviour |
|---|---|
| **Reset** | Discards all local draft nodes. VyOS is not contacted. |
| **Commit** | Sends all pending draft operations as a batch to `/configure`. The running configuration is updated but not yet saved to disk. |
| **Save** | Commits any remaining drafts, then calls `/config-file` with `op=save` to persist the configuration to `/config/config.boot`. |

## Draft Highlighting

Nodes with uncommitted changes are rendered in *italics*. The italic style propagates up the tree so any ancestor of a modified node is also italicised, making it easy to spot pending changes at a glance.

## Quick Start

```bash
# 1. Configure the environment
cp .env.example .env
#    Edit .env with your VyOS host, API key, and credentials

# 2. Build and start
docker compose up --build

# 3. Open the UI
open http://localhost:8080
```

## Local Development

### Prerequisites

- Node.js 22+
- npm 10+

### Frontend

```bash
cd frontend
npm install
npm run dev        # Vite dev server on http://localhost:5173
```

### Backend

```bash
cd backend
npm install
cp ../.env.example ../.env
npm run dev        # Express on http://localhost:3001 with --watch
```

Vite proxies `/api` and `/auth` to `localhost:3001` automatically.

## Environment Variables

| Variable | Description |
|---|---|
| `APP_USER` | Username for the application login |
| `APP_PASSWORD` | Password for the application login |
| `JWT_SECRET` | Secret used to sign and verify JWTs |
| `JWT_EXPIRES` | Token lifetime, e.g. `8h` |
| `VYOS_HOST` | Base URL of the VyOS API, e.g. `https://192.0.2.1` |
| `VYOS_KEY` | API key for the VyOS API |
| `VYOS_VERIFY_TLS` | `true` to verify the VyOS TLS certificate, `false` for self-signed |
| `CORS_ORIGIN` | Allowed browser origin; use a specific URL in production |
| `PORT` | Port the backend listens on inside the container (default: `3001`) |

## Security Notes

- `APP_PASSWORD` and `VYOS_KEY` are **never** exposed to the browser
- The VyOS API key is held exclusively in the backend process
- Rate limiting is applied to both the login endpoint and all API routes
- Security headers are set by Helmet
- JWT tokens are stored in memory only (no `localStorage`)

## Project Structure

```
vyos-client/
├── .dockerignore
├── .env.example
├── .gitignore
├── Dockerfile
├── README.md
├── docker-compose.yml
├── flake.nix
├── backend/
│   ├── package.json
│   └── server.js
└── frontend/
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.app.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api.ts
        ├── store.ts
        ├── types.ts
        ├── styles.css
        └── components/
            ├── ActionBar.tsx
            ├── ConfigTree.tsx
            └── LoginForm.tsx
```
