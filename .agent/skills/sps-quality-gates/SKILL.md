---
name: SarkiAI quality gates
description: Which checks to run for a given change, from typecheck and unit tests to the local smoke and production verification. Use before opening a PR, before merging, after a deploy, or when a check fails and you need the right scope.
---

# SarkiAI quality gates

## Baseline (every code change)

```bash
bun run typecheck          # turbo, all packages
bun run test               # turbo unit tests
bun run build              # when apps/web or a published package changes
```

Gated suites skip themselves when their variables are unset, so `bun test` is
safe without infrastructure. A **unit** test never touches the network, a
database or the clock.

## Matrix

| Change | Minimum checks |
| --- | --- |
| Documentation, skills, comments | none, but verify links and that no secret slipped in |
| A `packages/*` module | `bun test packages/<name>` + `bun run typecheck` |
| An API route / store | `bun test apps/api/src` + `bun run typecheck` + a `curl` on the route |
| Auth, sessions, TOTP, setup | API tests + both local paths (no mail → 201 + password; public host → 503) |
| Web page, component, translation | `cd apps/web && bun run typecheck` + `bun run build` + both locales/themes |
| Retrieval, chunking, ingestion | `bun test packages/retrieval packages/kb` + a seeded query on `/knowledge` → Retrieval |
| Provider selection, model, keys | `bun run check:provider <mode>` + one real generation |
| Compose, Dockerfile, deploy config | `docker compose config` |
| Any merge to `main` | everything above + production smoke below |

## Local smoke

```bash
curl -s localhost:8000/health                       # {"status":"ok", ...}
curl -s localhost:8000/v1/auth/captcha              # {required, siteKey} or {required:false}
curl -s localhost:8000/v1/auth/setup                # {initialized, storage, signup}
curl -s -o /dev/null -w '%{http_code}\n' localhost:8000/v1/readiness/runs   # 401 without a token
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/setup               # 200
```

With a running stack: start a scenario and one readiness dimension, confirm the
run appears in `/audit` and that `verifyChain()` reports an intact chain.

## Integration and e2e (gated)

```bash
MONGO_URL=mongodb://localhost:27017 bun run test:int
E2E_BASE_URL=http://localhost:8000 bun run test:e2e
```

## Production verification (after a `main` deploy)

1. `GET https://<api-host>/health` → `status: ok`, expected provider mode.
2. `GET https://<api-host>/v1/auth/captcha` → site key when Turnstile is set.
3. `GET https://<api-host>/v1/auth/setup` → `initialized: true`.
4. A protected route without a token → `401`.
5. The console loads and `/setup` answers `200` (or redirects when initialized).

## Reporting

In the PR body, list each command and its result (pass/fail, counts). Never
write "tests pass" without the command. A skipped gated suite is reported as
skipped, not as passing.
