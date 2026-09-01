# Standalone build for the mock-vyos dev/testing helper (see
# backend/cmd/mock-vyos). NOT part of the production vyos-client image
# (deploy/Dockerfile) - this is only used by docker-compose.yml for
# local testing without a real router.
#
# Deliberately no `# syntax=docker/dockerfile:1` pragma - see
# deploy/Dockerfile's own doc comment for why.

FROM golang:1.25-alpine AS build
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/mock-vyos ./cmd/mock-vyos

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/mock-vyos /usr/local/bin/mock-vyos
USER nonroot:nonroot
EXPOSE 8443
ENTRYPOINT ["/usr/local/bin/mock-vyos"]
