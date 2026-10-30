# Testing

Three levels: **unit** (no infrastructure), **integration** (*gated* by
environment variables, infrastructure required) and **e2e** (a running stack,
also *gated*). Integration and e2e suites **skip automatically** when their
variables are unset, so they can be versioned without depending on a particular
machine.

## Unit (no infrastructure): runs anywhere

```bash
bun run test          # turbo: bun test in every package (@sps/*)
bun test              # everything (unit + gated; gated suites skip)
```

Coverage: `@sps/shared` (readiness taxonomy 6/13, lenses, institutions),
`@sps/scenarios` (progressive release, asymmetry), `@sps/readiness` (0–5
scoring, composite, causal graph), `@sps/citations`, `@sps/report`,
`@sps/storage`, `@sps/retrieval` (RRF), `@sps/whatsapp`, `@sps/voice`,
`@sps/exercise`, `@sps/impact`.

Python (structure-aware chunker, standard library only):

```bash
cd services/ingestion && PYTHONPATH=src python3 tests/test_chunker.py
```

## Integration (*gated* by env, infrastructure required)

TypeScript:

```bash
MONGO_URL=mongodb://localhost:27017 bun run test:int          # audit (hash chain)
QDRANT_URL=http://localhost:6333 OLLAMA_BASE_URL=http://localhost:11434 \
  bun run test:int                                             # hybrid retrieval
```

Python (needs pydantic/fastapi/qdrant; the Compose images already have them):

```bash
cd services/ingestion && PYTHONPATH=src pytest tests/ \
  -k "schemas or embeddings or qdrant_store or api"
```

## e2e (*gated*, running stack)

```bash
E2E_BASE_URL=http://localhost:8000 bun run test:e2e
```

It checks `/health`, `POST /v1/scenarios/start` (agenda), the release of one
facilitator tick, and `POST /v1/readiness/report` (13 dimensions scored).

## CI

| Job | Command | Infrastructure |
|-----|---------|----------------|
| unit | `bun run typecheck && bun run test && bun run build` | none |
| unit-py | `pytest services/ingestion/tests` | ingestion image |
| integration | `bun run test:int` + `pytest -k integration` | mongo + qdrant + ollama |
| e2e | `docker compose up -d && make models && ./scripts/seed.sh`, then `bun run test:e2e` | full stack |

## Conventions

- TypeScript tests: `*.test.ts` (unit), `*.integration.test.ts` (gated).
- Python tests: `services/<svc>/tests/test_*.py` (pytest).
- A **unit** test never depends on the network or on running infrastructure.
