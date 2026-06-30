.PHONY: up down build test clean logs

# Start all services
up:
	docker compose up --build -d

# Stop all services
down:
	docker compose down

# Build without starting
build:
	docker compose build

# Run backend tests
test:
	cd backend && pytest tests/ -v

# View logs
logs:
	docker compose logs -f

# Clean up volumes and containers
clean:
	docker compose down -v --remove-orphans
	rm -rf backend/uploads/*

# Development mode (no Docker)
dev-backend:
	cd backend && uvicorn server:app --host 0.0.0.0 --port 8001 --reload

dev-frontend:
	cd frontend && yarn start
