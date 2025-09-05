# Makefile for AI DJ MERN stack
ENV_FILE := .env
DC := docker compose

default: up

$(ENV_FILE):
	@echo "Creating default .env from example..."
	cp .env.example .env
	@echo "Please edit .env with your Navidrome and Lidarr details."

up: $(ENV_FILE)
	$(DC) up -d --build

down:
	$(DC) down

logs:
	$(DC) logs -f backend frontend mongo

clean:
	$(DC) down -v
	docker image prune -f

rebuild:
	$(DC) build --no-cache

restart: down up
