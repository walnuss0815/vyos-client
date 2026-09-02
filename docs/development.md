# Development

## Prerequisites

The repository ships a [Nix flake](../flake.nix) with everything needed:
Go, Node.js, `golangci-lint`, `qemu`/`minisign`/`expect`/
`playwright-driver` (for the real-VyOS end-to-end suite, see
[../e2e/README.md](../e2e/README.md)), `actionlint`, and `shellcheck`.

```sh
nix develop
```

If you don't use Nix, install Go (see `backend/go.mod` for the version)
and Node.js 22+ yourself; everything else in the flake is optional
tooling. Either way, `oxlint` isn't part of the flake at all - it's a
regular `frontend/package.json` devDependency, so `npm install` in
`frontend/` (needed regardless of Nix) is what actually provides it.

## Repository layout

```
backend/    Go module: the BFF server (cmd/vyos-client), the mock-vyos
            dev helper (cmd/mock-vyos), and internal/*
frontend/   Vite + React + TypeScript SPA
shared/     sensitive-fields.json — single source of truth for masking,
            consumed by both backend and frontend
deploy/     Dockerfiles (production + mock-vyos) + example VyOS
            container config snippets
docker-compose.yml, .env.example   local testing stack (see below)
e2e/        real-VyOS end-to-end tests (QEMU + Playwright, see e2e/README.md)
docs/       this documentation
```

## Running locally: docker compose (easiest)

The fastest way to run the whole stack is `docker-compose.yml`, which
builds and runs VyOS Client alongside `mock-vyos` — a real (non-httptest)
HTTP server wrapping `backend/internal/testutil`'s fake VyOS REST API
(the same one the Go test suite uses), pre-seeded with a small example
configuration. It's not a faithful VyOS emulator, just enough of the real
wire protocol to exercise login, config read/write, and commit/save
end-to-end without a router.

```sh
cp .env.example .env
docker compose up --build
```

Then open `https://localhost:8443` (a self-signed-certificate warning is
expected) and log in with `admin` / `admin` — `mock-vyos` is pre-seeded
with a real, working `system login user admin` account (see
`backend/cmd/mock-vyos/main.go`) for this default `AUTH_MODE=vyos-users`
flow to work out of the box, the same way it would against a real
router's own local users.

**If you opt into `AUTH_MODE=static` instead** (see `.env.example`):
bcrypt hashes contain `$` characters, which Docker Compose treats as
variable-interpolation syntax in `.env` files — every `$` in
`UI_ADMIN_PASSWORD_HASH` must be doubled (`$$`) or Compose will silently
corrupt the hash and every login will fail. `.env.example`'s commented-out
example already does this correctly; if you generate your own hash with
`hash-password`, remember to double its `$` characters before pasting it
into `.env`.

To test against a **real VyOS router** instead of `mock-vyos`, set
`VYOS_API_URL`/`VYOS_API_KEY` in `.env` to point at it and run:

```sh
docker compose up vyos-client --no-deps --build
```

`.env` is gitignored (`.env.example` is the tracked template) — never
commit real secrets into it.

## Running locally: without Docker

For faster iteration on the Go code or frontend specifically, run them
directly. The backend still needs a VyOS HTTPS API to talk to — point
`VYOS_API_URL` at a real router, or run `mock-vyos` standalone:

```sh
# Terminal 1: mock VyOS API on :8443
cd backend && go run ./cmd/mock-vyos
```

```sh
# Terminal 2: run the backend (AUTH_MODE defaults to vyos-users - log in
# with admin/admin, the same account mock-vyos seeds for docker compose)
cd backend
LISTEN_ADDR=:9443 \
VYOS_API_URL=http://127.0.0.1:8443 \
VYOS_API_KEY=dev-key \
SESSION_SECRET=dev-secret-at-least-32-bytes-long \
go run ./cmd/vyos-client
```

To use `AUTH_MODE=static` instead, generate a password hash first and
add `AUTH_MODE=static UI_ADMIN_USER=admin UI_ADMIN_PASSWORD_HASH='<hash>'`
to the command above:

```sh
go run ./cmd/vyos-client hash-password mypassword
```

```sh
# Terminal 3: frontend dev server
cd frontend
npm install
npm run dev
```

The frontend dev server serves the SPA on Vite's own port; the backend
serves both the API and (once built) the embedded SPA on its own. For a
fully wired local setup matching production, use `make build-backend`
(builds the frontend, copies it into `backend/internal/webapp/dist`, and
compiles the Go binary) and run that single binary.

See the [Makefile](../Makefile) for all available targets.

## Testing

```sh
make test          # backend + frontend
make test-backend  # go test ./... (backend/)
make test-frontend # vitest run (frontend/)
```

- **Backend**: standard `go test`, using `backend/internal/testutil`'s
  fake VyOS REST server (modeled on vyos-1x's actual request models, not
  just its docs — see [architecture.md](architecture.md)) rather than
  mocks of our own client. Includes real HTTP integration tests via
  `httptest` exercising the full `Server.Routes()` handler, cookies and
  all.
- **Frontend**: Vitest + React Testing Library + MSW, mocking the backend
  API at the HTTP layer rather than mocking React Query/fetch internals,
  so tests exercise the real request/response contract.

## Linting

```sh
make lint          # backend + frontend
```

- Backend: `golangci-lint run ./...` (config: none needed, defaults are
  used deliberately to keep the bar simple and consistent).
- Frontend: `oxlint` (config: `frontend/.oxlintrc.json`).
- GitHub Actions workflows: `actionlint .github/workflows/*.yml` (part of
  the flake; not currently wired into `make lint`, run it directly).

## Keeping the masking source in sync

`shared/sensitive-fields.json` is the single source of truth for which
config leaf names are treated as secrets. The backend embeds its own
copy at `backend/internal/mask/sensitive-fields.json` (since Go's
`go:embed` can't reach outside its module root) — after editing the
shared file, copy it over:

```sh
cp shared/sensitive-fields.json backend/internal/mask/sensitive-fields.json
```

`TestSensitiveFieldsListMatchesSharedSource` (backend) and CI's explicit
`diff` step both fail the build if these drift apart. The frontend
imports the shared file directly (via a Vite/tsconfig path alias), so
there's nothing to keep in sync on that side.

## Building the container image

```sh
make docker
# or directly:
docker buildx build -f deploy/Dockerfile -t vyos-client:local .
```

The Dockerfile is a 3-stage build (Node → Go → distroless); see
[architecture.md](architecture.md) for why the final image is
`gcr.io/distroless/static-debian12:nonroot` and how the container
healthcheck works without a shell.
