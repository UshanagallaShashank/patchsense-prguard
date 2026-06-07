.PHONY: install dev build preview test typecheck clean

## install: install all npm dependencies
install:
	npm ci

## dev: start Vite dev server with API proxy
dev:
	npm run dev

## build: production build (tsc + vite)
build:
	npm run build

## preview: preview the production build locally
preview:
	npm run preview

## test: run Vitest in single-run mode
test:
	npm test -- --run

## test-watch: run Vitest in watch mode
test-watch:
	npm test

## test-cov: run Vitest with coverage report
test-cov:
	npm test -- --run --coverage

## typecheck: run tsc without emitting files
typecheck:
	npx tsc --noEmit

## clean: remove build artifacts and node_modules
clean:
	rm -rf dist node_modules .vite

## help: list all available targets
help:
	@grep -E '^## ' Makefile | sed 's/## //'
