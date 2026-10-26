# Deploying to the locked-down sandbox

The sandbox provides the Qdrant/Mongo endpoints and cloud credits for model
fine-tuning. Our stack is stateless: the vector KB lives in Qdrant
(`QDRANT_URL`) and the operational store (audit + CoT) in MongoDB
(`MONGODB_URI`). Leave `QDRANT_URL` unset to use the bundled Qdrant service.

## 1. Configure

```bash
cp deploy/sandbox/.env.sandbox.example .env.sandbox
# fill MONGODB_URI, SERVICE_API_KEY (+ OLLAMA_URL/EMBEDDING_MODEL if managed)
```

## 2. Run

Pull prebuilt images (recommended):

```bash
docker compose --env-file .env.sandbox -f deploy/sandbox/docker-compose.sandbox.yml up -d
```

Or build on the sandbox host:

```bash
docker compose --env-file .env.sandbox -f deploy/sandbox/docker-compose.sandbox.yml up -d --build
```

## 3. Bootstrap the knowledge base

The ingestion service creates the Qdrant collection + payload indexes on
startup. Then ingest the Cameroon corpus:

```bash
./scripts/seed.sh --api https://api.policy-sandbox.example --country cm
```

## 4. Fine-tuning (optional, sandbox credits)

Fine-tuning happens out-of-band against the Lab's model endpoints using the
exported QA pairs from `packages/readiness`. Point the API at the tuned endpoint
with `DEFAULT_LLM_PROVIDER` + the provider key; no code change is required.

## Health checks

- `GET /health` on api, ingestion, ocr
- `GET /v1/audit/chain` verifies the tamper-evident audit log
