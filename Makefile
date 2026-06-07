.PHONY: help
.PHONY: install dev-be dev-fe
.PHONY: test test-be test-fe test-cov
.PHONY: lint lint-fix typecheck
.PHONY: build preview
.PHONY: migrate migrate-down migrate-gen worker
.PHONY: up up-build down logs clean

PYTHON  := python3.11

# venv lives inside backend/ — BE_VENV is relative to backend/ after cd
VENV    := backend/.venv
BE_VENV := .venv

BE := cd backend &&
FE := cd frontend &&

# ── Setup ─────────────────────────────────────────────────────────────────────

## install       create backend/.venv, install backend + frontend deps
install:
	$(BE) $(PYTHON) -m venv $(BE_VENV)
	$(VENV)/bin/pip install --upgrade pip -q
	$(VENV)/bin/pip install -r backend/requirements.txt -q
	$(VENV)/bin/pip install ruff mypy pytest pytest-asyncio -q
	$(FE) npm ci

# ── Dev servers ───────────────────────────────────────────────────────────────

## dev-be         start FastAPI with hot-reload — watches only backend/app/
dev-be:
	$(BE) $(BE_VENV)/bin/uvicorn main:app --host 0.0.0.0 --port 8000 \
		--reload --reload-dir app \
		--reload-exclude '*.venv*' --reload-exclude '*__pycache__*' \
		--reload-exclude '*.pyc' --reload-exclude '*.egg-info*'

## dev-fe         start Vite dev server on :5173
dev-fe:
	$(FE) npm run dev

# ── Testing ───────────────────────────────────────────────────────────────────

## test           run backend pytest + frontend vitest
test: test-be test-fe

## test-be        run backend pytest only
test-be:
	$(BE) $(BE_VENV)/bin/pytest tests/ -v

## test-fe        run frontend vitest only
test-fe:
	$(FE) npm test -- --run

## test-cov       run both suites with coverage
test-cov:
	$(BE) $(BE_VENV)/bin/pytest tests/ -v --cov=app --cov-report=term-missing
	$(FE) npm test -- --run --coverage

# ── Lint & types ──────────────────────────────────────────────────────────────

## lint           lint backend with ruff
lint:
	$(BE) $(BE_VENV)/bin/ruff check .

## lint-fix       lint backend and auto-fix safe issues
lint-fix:
	$(BE) $(BE_VENV)/bin/ruff check . --fix

## typecheck      mypy backend + tsc frontend
typecheck:
	$(BE) $(BE_VENV)/bin/mypy app --config-file mypy.ini
	$(FE) npx tsc --noEmit

# ── Build ─────────────────────────────────────────────────────────────────────

## build          production build of the frontend
build:
	$(FE) npm run build

## preview        preview the production frontend build locally
preview:
	$(FE) npm run preview

# ── Database / migrations ─────────────────────────────────────────────────────

## migrate        apply all pending alembic migrations
migrate:
	$(BE) $(BE_VENV)/bin/alembic upgrade head

## migrate-down   rollback the last migration
migrate-down:
	$(BE) $(BE_VENV)/bin/alembic downgrade -1

## migrate-gen    generate a new migration  (usage: make migrate-gen msg="add column")
migrate-gen:
	$(BE) $(BE_VENV)/bin/alembic revision --autogenerate -m "$(msg)"

# ── Worker ────────────────────────────────────────────────────────────────────

## worker         start the ARQ background worker
worker:
	$(BE) $(BE_VENV)/bin/python worker.py

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

## clean          remove backend/.venv, backend caches, frontend build artifacts
clean:
	rm -rf $(VENV) backend/__pycache__ backend/.pytest_cache
	rm -rf backend/.mypy_cache backend/.ruff_cache
	find backend -name "*.pyc" -delete
	rm -rf frontend/dist frontend/node_modules frontend/.vite

# ── Help ──────────────────────────────────────────────────────────────────────

## help           list all available targets
help:
	@grep -E '^## ' Makefile | column -t -s '  '
