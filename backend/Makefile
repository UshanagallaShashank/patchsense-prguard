.PHONY: install dev test lint typecheck migrate migrate-down migrate-gen worker clean

PYTHON := python3.11
VENV   := .venv
PIP    := $(VENV)/bin/pip
PYTEST := $(VENV)/bin/pytest
RUFF   := $(VENV)/bin/ruff
MYPY   := $(VENV)/bin/mypy
UV     := $(VENV)/bin/uvicorn
ALEMBIC := $(VENV)/bin/alembic

## install: create venv and install all dependencies
install:
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt
	$(PIP) install ruff "mypy[pydantic]" pytest pytest-asyncio

## dev: run FastAPI with hot-reload
dev:
	$(VENV)/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload

## test: run all pytest tests
test:
	$(PYTEST) tests/ -v

## test-cov: run tests with coverage report
test-cov:
	$(PYTEST) tests/ -v --cov=app --cov-report=term-missing

## lint: run ruff linter
lint:
	$(RUFF) check .

## lint-fix: run ruff and auto-fix safe issues
lint-fix:
	$(RUFF) check . --fix

## typecheck: run mypy with pydantic plugin
typecheck:
	$(MYPY) app --config-file mypy.ini

## migrate: apply all pending alembic migrations
migrate:
	$(ALEMBIC) upgrade head

## migrate-down: rollback the last migration
migrate-down:
	$(ALEMBIC) downgrade -1

## migrate-gen: generate a new migration (usage: make migrate-gen msg="add column")
migrate-gen:
	$(ALEMBIC) revision --autogenerate -m "$(msg)"

## worker: start the ARQ background worker
worker:
	$(PYTHON) -m $(VENV)/bin/python worker.py

## clean: remove venv and cache files
clean:
	rm -rf $(VENV) __pycache__ .pytest_cache .mypy_cache .ruff_cache
	find . -name "*.pyc" -delete

## help: list all available targets
help:
	@grep -E '^## ' Makefile | sed 's/## //'
