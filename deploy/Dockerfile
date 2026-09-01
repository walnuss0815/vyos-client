# Multi-stage build for VyOS Client. Produces a small, distroless,
# non-root image suitable for `set container name vyos-client image ...`
# on a VyOS instance (Podman-based container engine). Build from the
# repository root:
#
#   docker buildx build -f deploy/Dockerfile -t vyos-client:local .
#
# As used by .github/workflows/release.yml (amd64 only - VyOS itself
# only supports amd64; re-add `,linux/arm64` to --platform below if
# that ever changes):
#
#   docker buildx build -f deploy/Dockerfile \
#     --platform linux/amd64 \
#     -t ghcr.io/<org>/vyos-client:latest --push .
#
# Deliberately no `# syntax=docker/dockerfile:1` pragma: that directive
# only matters if this file used a Dockerfile syntax feature newer than
# what's built into BuildKit itself (heredocs, `RUN --mount=`, `COPY
# --link`, ...) - it doesn't, so the pragma would only add a pointless
# network dependency on resolving docker.io/docker/dockerfile:1 before
# every single build, with no functional benefit. Re-add it (pinned to
# a digest, not a floating tag) if a future change genuinely needs a
# newer syntax feature.

# ---- frontend build -------------------------------------------------
FROM node:22-alpine AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY shared/ /src/shared/
RUN npm run build

# ---- backend build ----------------------------------------------------
FROM golang:1.25-alpine AS backend-build
WORKDIR /src/backend

# Cache module downloads separately from source changes.
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
# The frontend build output replaces the committed placeholder so
# go:embed picks up the real SPA.
COPY --from=frontend-build /src/frontend/dist/ ./internal/webapp/dist/

ARG TARGETOS
ARG TARGETARCH
# The release version (see .github/workflows/release.yml, computed
# from Conventional Commits per .releaserc.json). Defaults to "dev" for
# local/non-CI builds, matching cmd/vyos-client's own `version` var
# default - see that file's doc comment.
ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /out/vyos-client ./cmd/vyos-client

# ---- final image --------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot AS final

COPY --from=backend-build /out/vyos-client /usr/local/bin/vyos-client

USER nonroot:nonroot
EXPOSE 8443
# distroless has no shell/curl, so the healthcheck is a subcommand of
# the app binary itself (see cmd/vyos-client/healthcheck.go).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/usr/local/bin/vyos-client", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/vyos-client"]
