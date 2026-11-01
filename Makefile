# SarkiAI Policy Sandbox · developer shortcuts
# All targets wrap docker compose so the full stack or any subset can be launched.

COMPOSE      := docker compose
COMPOSE_DEV  := docker compose -f docker-compose.yml -f docker-compose.dev.yml

.DEFAULT_GOAL := help
.PHONY: help up up-kb up-app up-qdrant up-ollama up-mongo up-minio ingestion ocr transcription api web \
        dev dev-kb dev-app logs ps down clean rebuild seed models glimmer sandbox-config secrets-edit secrets-encrypt hooks

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Launch the full stack (detached)
	$(COMPOSE) up --build -d

up-kb: ## Launch only the knowledge-base plane (ollama + qdrant + ingestion + ocr)
	$(COMPOSE) up --build -d ollama qdrant ingestion ocr

up-app: ## Launch only the application plane (api + web)
	$(COMPOSE) up --build -d api web

up-qdrant: ## Launch only Qdrant (vector KB)
	$(COMPOSE) up -d qdrant

up-ollama: ## Launch only Ollama (local LLM + embeddings)
	$(COMPOSE) up -d ollama

models: ## Pull the local models (Muse Glimmer + bge-m3)
	$(COMPOSE) up -d ollama
	@echo "Waiting for Ollama..."
	@until $(COMPOSE) exec -T ollama ollama list >/dev/null 2>&1; do sleep 2; done
	$(COMPOSE) exec -T ollama ollama pull $${OLLAMA_MODEL:-muse-glimmer}
	$(COMPOSE) exec -T ollama ollama pull $${EMBEDDING_MODEL:-bge-m3}
	@echo "Local models ready."

glimmer: ## Pull Muse Glimmer 30B and build the sovereign model (Ollama >= 0.32.7)
	$(COMPOSE) up -d ollama
	@echo "Waiting for Ollama..."
	@until $(COMPOSE) exec -T ollama ollama list >/dev/null 2>&1; do sleep 2; done
	$(COMPOSE) exec -T ollama ollama pull $${MUSE_GLIMMER_MODEL:-muse-glimmer}
	$(COMPOSE) cp deploy/ollama/Modelfile.glimmer ollama:/tmp/Modelfile.glimmer
	$(COMPOSE) exec -T ollama ollama create sps-glimmer -f /tmp/Modelfile.glimmer
	@echo "Sovereign model ready."
	@echo "  SANDBOX_MODE=sovereign"
	@echo "  MUSE_GLIMMER_MODEL=sps-glimmer"
	@echo "  bun run check:provider sovereign"

up-mongo: ## Launch only MongoDB (audit + CoT, no vectors)
	$(COMPOSE) up -d mongo

up-minio: ## Launch only MinIO (+ bucket init)
	$(COMPOSE) up -d minio minio-init

ingestion: ## Launch qdrant + ingestion
	$(COMPOSE) up -d qdrant ingestion

ocr: ## Launch ocr
	$(COMPOSE) up --build -d ocr

transcription: ## Launch transcription
	$(COMPOSE) up --build -d transcription

api: ## Launch api (with its dependencies)
	$(COMPOSE) up --build -d api

web: ## Launch web (with its dependencies)
	$(COMPOSE) up --build -d web

dev: ## Launch full stack with hot reload
	$(COMPOSE_DEV) up

dev-kb: ## Launch KB plane with hot reload
	$(COMPOSE_DEV) up ollama qdrant ingestion ocr

dev-app: ## Launch app plane with hot reload
	$(COMPOSE_DEV) up api web

logs: ## Follow logs (all services)
	$(COMPOSE) logs -f --tail=100

ps: ## Show container status
	$(COMPOSE) ps

down: ## Stop the stack
	$(COMPOSE) down

clean: ## Stop and remove volumes (destroys local data)
	$(COMPOSE) down -v --remove-orphans

rebuild: ## Rebuild all images from scratch
	$(COMPOSE) build --no-cache

seed: ## Ingest the sample Cameroon corpus into the KB
	./scripts/seed.sh

hooks: ## Install the git hooks (pre-push branch guard)
	./scripts/install-git-hooks.sh

sandbox-config: ## Validate the locked-down sandbox compose file
	docker compose -f deploy/sandbox/docker-compose.sandbox.yml config

secrets-encrypt: ## Encrypt .env -> .env.enc (SOPS + age)
	sops --encrypt --input-type dotenv --output-type dotenv .env > .env.enc

secrets-edit: ## Edit the encrypted .env.enc in place
	sops .env.enc

secrets-decrypt: ## Decrypt .env.enc -> .env (local restore)
	sops --decrypt .env.enc > .env
