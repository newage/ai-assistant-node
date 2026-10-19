COMPOSE = docker compose -f docker-compose.yml

.PHONY: up down rebuild console seed seed-dry

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

rebuild:
	$(COMPOSE) down
	$(COMPOSE) up -d --force-recreate --renew-anon-volumes

# Shell inside the running container; run npm there (npm test, npm run seed -- --dry-run, ...)
console:
	$(COMPOSE) exec app sh

seed:
	$(COMPOSE) exec app npm run seed

seed-dry:
	$(COMPOSE) exec app npm run seed -- --dry-run
