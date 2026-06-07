.PHONY: install dev test lint typecheck build clean up down logs help
.PHONY: be-install be-dev be-test be-lint be-typecheck be-migrate be-worker
.PHONY: fe-install fe-dev fe-test fe-build fe-typecheck fe-preview

# ── Docker ────────────────────────────────────────────────────────────────────

## up: start all services via docker-compose (api, worker, redis, db)
up:
	docker-compose up

## up-build: build images and start all services
up-build:
	docker-compose up --build

## down: stop and remove all containers
down:
	docker-compose down

## logs: tail logs from all running containers
logs:
	docker-compose logs -f

# ── Aggregate ─────────────────────────────────────────────────────────────────

## install: install backend + frontend dependencies
install: be-install fe-install

## test: run backend + frontend tests
test: be-test fe-test

## lint: lint backend code
lint: be-lint

## typecheck: type-check backend + frontend
typecheck: be-typecheck fe-typecheck

## build: build frontend for production
build: fe-build

## clean: remove all build artifacts and caches
clean: be-clean fe-clean

# ── Backend ───────────────────────────────────────────────────────────────────

## be-install: install backend Python dependencies
be-install:
	$(MAKE) -C backend install

## be-dev: start backend FastAPI dev server
be-dev:
	$(MAKE) -C backend dev

## be-test: run backend pytest suite
be-test:
	$(MAKE) -C backend test

## be-test-cov: run backend tests with coverage
be-test-cov:
	$(MAKE) -C backend test-cov

## be-lint: run ruff on backend code
be-lint:
	$(MAKE) -C backend lint

## be-lint-fix: run ruff with auto-fix on backend
be-lint-fix:
	$(MAKE) -C backend lint-fix

## be-typecheck: run mypy on backend code
be-typecheck:
	$(MAKE) -C backend typecheck

## be-migrate: apply all pending database migrations
be-migrate:
	$(MAKE) -C backend migrate

## be-migrate-down: rollback last migration
be-migrate-down:
	$(MAKE) -C backend migrate-down

## be-migrate-gen msg="...": generate a new migration
be-migrate-gen:
	$(MAKE) -C backend migrate-gen msg="$(msg)"

## be-worker: start the ARQ background worker
be-worker:
	$(MAKE) -C backend worker

## be-clean: remove backend venv and caches
be-clean:
	$(MAKE) -C backend clean

# ── Frontend ──────────────────────────────────────────────────────────────────

## fe-install: install frontend npm dependencies
fe-install:
	$(MAKE) -C frontend install

## fe-dev: start Vite dev server
fe-dev:
	$(MAKE) -C frontend dev

## fe-test: run Vitest tests
fe-test:
	$(MAKE) -C frontend test

## fe-test-cov: run Vitest with coverage
fe-test-cov:
	$(MAKE) -C frontend test-cov

## fe-build: production build
fe-build:
	$(MAKE) -C frontend build

## fe-preview: preview production build
fe-preview:
	$(MAKE) -C frontend preview

## fe-typecheck: run tsc --noEmit
fe-typecheck:
	$(MAKE) -C frontend typecheck

## fe-clean: remove frontend build artifacts
fe-clean:
	$(MAKE) -C frontend clean

# ── Help ──────────────────────────────────────────────────────────────────────

## help: list all available targets
help:
	@grep -E '^## ' Makefile | sed 's/## //'
