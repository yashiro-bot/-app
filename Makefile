# cigar-collection monorepo — developer Makefile
# T1 scaffold: pure wiring, no business logic. Each sub-project is independent.

.PHONY: help dev-backend dev-admin dev-mobile-h5 dev-mobile-app build-all test-all

help:
	@echo "cigar-collection — make targets"
	@echo "  make dev-backend      start Fastify backend (tsx watch)"
	@echo "  make dev-admin        start Vue admin SPA (vite dev)"
	@echo "  make dev-mobile-h5    start uni-app H5 dev server"
	@echo "  make dev-mobile-app   start uni-app APP dev (HBuilderX)"
	@echo "  make build-all        build backend + admin + mobile H5"
	@echo "  make test-all         run vitest in backend"

dev-backend:
	cd backend && npm run dev

dev-admin:
	cd admin && npm run dev

dev-mobile-h5:
	cd mobile-app && npm run dev:h5

dev-mobile-app:
	cd mobile-app && npm run dev:app

build-all:
	cd backend && npm run build
	cd admin && npm run build
	cd mobile-app && npm run build:h5

test-all:
	cd backend && npm test
