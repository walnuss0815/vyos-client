.PHONY: help dev-backend dev-frontend build-frontend build-backend build test test-backend test-frontend lint lint-backend lint-frontend docker fmt clean

help:
	@echo "Targets:"
	@echo "  dev-backend      run the Go backend locally (needs env vars, see docs/development.md)"
	@echo "  dev-frontend     run the Vite dev server (proxies /api to the backend)"
	@echo "  build-frontend   build the frontend SPA into frontend/dist"
	@echo "  build-backend    copy the frontend build into the backend and compile the Go binary"
	@echo "  build            build-frontend + build-backend"
	@echo "  test             run backend and frontend test suites"
	@echo "  lint             run backend and frontend linters"
	@echo "  docker           build the production container image (deploy/Dockerfile)"
	@echo "  fmt              gofmt the backend"
	@echo "  clean            remove build artifacts"

dev-backend:
	cd backend && go run ./cmd/vyos-client

dev-frontend:
	cd frontend && npm run dev

build-frontend:
	cd frontend && npm ci && npm run build

VERSION ?= dev

build-backend: build-frontend
	rm -rf backend/internal/webapp/dist
	mkdir -p backend/internal/webapp/dist
	cp -r frontend/dist/. backend/internal/webapp/dist/
	cd backend && go build -ldflags="-X main.version=$(VERSION)" -o bin/vyos-client ./cmd/vyos-client

build: build-backend

test: test-backend test-frontend

test-backend:
	cd backend && go test ./...

test-frontend:
	cd frontend && npm ci && npm run test

lint: lint-backend lint-frontend

lint-backend:
	cd backend && golangci-lint run ./...

lint-frontend:
	cd frontend && npm ci && npm run lint

fmt:
	cd backend && gofmt -l -w .

docker:
	docker buildx build -f deploy/Dockerfile -t vyos-client:local .

clean:
	rm -rf backend/bin frontend/dist backend/internal/webapp/dist/*
	git checkout -- backend/internal/webapp/dist/index.html 2>/dev/null || true
