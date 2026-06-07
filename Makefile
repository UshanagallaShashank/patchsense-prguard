.PHONY: help
.PHONY: install dev-be dev-fe test test-cov lint lint-fix typecheck build preview
.PHONY: migrate migrate-down migrate-gen worker
.PHONY: up up-build down logs clean

PYTHON     := python3.11
VENV       := backend/.venv
PIP        := $(VENV)/bin/pip
PYTEST     := $(VENV)/bin/pytest
RUFF       := $(VENV)/bin/ruff
MYPY       := $(VENV)/bin/mypy
ALEMBIC    := $(VENV)/bin/alembic
UVICORN    := $(VENV)/bin/uvicorn

# ── Setup ─────────────────────────────────────────────────────────────────────

## install       install all backend + frontend dependencies
install:
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip -q
	$(PIP) install -r backend/requirements.txt -q
	$(PIP) install ruff "mypy[pydantic]" pytest pytest-asyncio -q
	cd frontend && npm ci

# ── Dev servers ───────────────────────────────────────────────────────────────

## dev-be         start FastAPI backend with hot-reload on :8000
dev-be:
	cd backend && $(abspath $(UVICORN)) main:app --host 0.0.0.0 --port 8000 --reload

## dev-fe         start Vite frontend dev server on :5173
dev-fe:
	cd frontend && npm run dev

# ── Testing ───────────────────────────────────────────────────────────────────

## test           run backend pytest + frontend vitest
test:
	cd backend && $(abspath $(PYTEST)) tests/ -v
	cd frontend && npm test -- --run

## test-be        run backend tests only
test-be:
	cd backend && $(abspath $(PYTEST)) tests/ -v

## test-fe        run frontend tests only
test-fe:
	cd frontend && npm test -- --run

## test-cov       run both test suites with coverage
test-cov:
	cd backend && $(abspath $(PYTEST)) tests/ -v --cov=app --cov-report=term-missing
	cd frontend && npm test -- --run --coverage

# ── Lint & types ──────────────────────────────────────────────────────────────

## lint           lint backend with ruff
lint:
	cd backend && $(abspath $(RUFF)) check .

## lint-fix       lint backend and auto-fix safe issues
lint-fix:
	cd backend && $(abspath $(RUFF)) check . --fix

## typecheck      mypy backend + tsc frontend
typecheck:
	cd backend && $(abspath $(MYPY)) app --config-file mypy.ini
	cd frontend && npx tsc --noEmit

# ── Build ─────────────────────────────────────────────────────────────────────

## build          production build of the frontend
build:
	cd frontend && npm run build

## preview        preview the production frontend build
preview:
	cd frontend && npm run preview

# ── Database / migrations ─────────────────────────────────────────────────────

## migrate        apply all pending alembic migrations
migrate:
	cd backend && $(abspath $(ALEMBIC)) upgrade head

## migrate-down   rollback the last migration
migrate-down:
	cd backend && $(abspath $(ALEMBIC)) downgrade -1

## migrate-gen    generate a new migration  (usage: make migrate-gen msg="add column")
migrate-gen:
	cd backend && $(abspath $(ALEMBIC)) revision --autogenerate -m "$(msg)"

# ── Worker ────────────────────────────────────────────────────────────────────

## worker         start the ARQ background worker
worker:
	cd backend && $(PYTHON) worker.py

# ── Docker ────────────────────────────────────────────────────────────────────

## up             start all services via docker-compose
up:
	docker-compose up

## up-build       rebuild images and start all services
up-build:
	docker-compose up --build

## down           stop and remove all containers
down:
	docker-compose down

## logs           tail logs from all running containers
logs:
	docker-compose logs -f

# ── Clean ─────────────────────────────────────────────────────────────────────

## clean          remove backend venv, caches, and frontend build artifacts
clean:
	rm -rf $(VENV) backend/__pycache__ backend/.pytest_cache backend/.mypy_cache backend/.ruff_cache
	find backend -name "*.pyc" -delete
	rm -rf frontend/dist frontend/node_modules frontend/.vite

# ── Help ──────────────────────────────────────────────────────────────────────

## help           list all available targets
help:
	@grep -E '^## ' Makefile | column -t -s ' '
