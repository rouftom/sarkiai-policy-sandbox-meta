# Testing

Three levels: **unit** (no infrastructure), **integration** (*gated* by
environment variables, MongoDB required) and **e2e** (a running stack, also
*gated*). Integration and e2e suites **skip automatically** when their variables
are unset, so they can be versioned without depending on a particular machine.

## Unit (no infrastructure): runs anywhere

```bash
bun run typecheck     # turbo: 40 tasks
bun run test          # turbo: bun test in every package (@sps/*)
bun test packages apps # what CI runs
bun run build         # turbo: 21 tasks
```

Coverage:

| Package | What the tests pin |
|---------|--------------------|
| `@sps/shared` | readiness taxonomy (6 factors / 13 dimensions), lenses, institutions, corpus rights |
| `@sps/scenarios` | progressive release, information asymmetry |
| `@sps/readiness` | dimension scoring, composite, cross-dimension links |
| `@sps/retrieval` | agentic search (plan, sub-agents, judge loop, fallback, cache), BM25 fusion, Atlas/Text index definitions, ingestion and rights gate |
| `@sps/agents` | planner, orchestrator, prompts, structured output, tools, usage, provider modes (Meta API, Baseten, Ollama) |
| `@sps/gazette` | page layout, segmentation pipeline, failure reporting |
| `@sps/kb` | structure-aware chunking (headings, article numbers, overlap) |
| `@sps/citations`, `@sps/report`, `@sps/storage`, `@sps/whatsapp`, `@sps/audit`, `@sps/voice` | citation validation, reports, storage, channels, hash chain, voice |
| `apps/api` | routes, config, rate limits, Turnstile, sessions, audit windows, usage store |

There is no Python test suite: the Python services were removed, and chunking,
ingestion and retrieval are covered by the TypeScript packages above.

## Integration (gated by env, MongoDB required)

```bash
MONGO_URL=mongodb://localhost:27017 bun run test:int
```

The gated suites are `packages/audit/src/audit.integration.test.ts` (hash
chain), `packages/auth/src/reset.integration.test.ts` (password reset) and
`apps/api/test/demo-reset.integration.test.ts` (demo reset). Without
`MONGO_URL` they skip.

There is no vector-store or embedding service to start: the corpus is searched
lexically, and the agentic search is unit-tested with an injected model.

## e2e (gated, running stack)

```bash
E2E_BASE_URL=http://localhost:8000 bun run test:e2e
```

It checks `/health`, `POST /v1/scenarios/start` (agenda), the release of one
facilitator tick, and `POST /v1/readiness/report` (13 dimensions scored).

## CI

`.github/workflows/ci.yml`, job `test`, on every push to `main`/`develop` and on
every pull request:

```bash
bun install --frozen-lockfile --ignore-scripts
bun run typecheck
bun test packages apps
```

No infrastructure in CI: unit tests only, gated suites skip. The e2e suite needs
the running stack and stays out of CI.

## Conventions

- TypeScript tests: `*.test.ts` (unit), `*.integration.test.ts` (gated).
- A **unit** test never depends on the network or on running infrastructure.
- A model is injected, never called: the agentic search tests pass a fake
  `think` function.
