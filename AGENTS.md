<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# SarkiAI Policy Sandbox — agent guide

Entry point for every agent working in this repository. Read this file, then
load the matching skill from `.agent/skills/` instead of exploring blindly.

## What this repository is

A policy-grounded, multi-agent decision engine built for the Meta Global AI
Developer Hackathon (Cameroon). It ingests national policy corpora, runs
scenario and readiness analyses, and records every step in a hash-chained audit
trail. It is a **standalone public repository**: never import `@sarkiai/*` or the
proprietary AgenticUI harness (see `docs/RULES.md`).

## Golden commands

| Task | Command |
|---|---|
| Install dependencies | `bun install` |
| Full local stack (Docker) | `cp .env.example .env && make up && make models` |
| Hot reload without containers | `bun run dev` |
| Typecheck | `bun run typecheck` |
| Unit tests (turbo, per package) | `bun run test` |
| Everything (gated suites skip) | `bun test` |
| Build | `bun run build` |
| Install the git guard | `make hooks` |
| Stack status / logs | `make ps` / `make logs` |
| Python chunker tests | `cd services/ingestion && PYTHONPATH=src python3 tests/test_chunker.py` |

Run `make help` for the full Docker target list. `make models` pulls
`OLLAMA_MODEL` (Muse Glimmer).

## Lay of the land

| Path | Role |
| --- | --- |
| `apps/api` | Bun + Fastify API: agents, scenarios, approvals, auth, metering, SSE |
| `apps/web` | Next.js 16 workspace UI (policy lenses, runs, ops console) |
| `packages/*` | Shared domain logic: retrieval, models, storage, auth, types |
| `services/*` | Ingestion, OCR, transcription and the chart/DOCX MCP sidecars |
| `scripts/` | Operational scripts (migrations, seeds, checks) |
| `docs/` | Architecture, data model, roadmap, compliance notes |

Service map: `docs/ARCHITECTURE.md`. Ports and variables: `docker-compose.yml`
and `.env.example`. Every source file carries a header comment stating its role.

## Non-negotiables

- **Branches**: `main` is production, `develop` is integration, `meta-hackathon`
  is the submission mirror, `feat/*`, `fix/*`, `docs/*`, `chore/*` are topic
  branches. No direct pushes to the protected branches — PR only
  (`.githooks/pre-push` + GitHub protection).
- **English**: code, comments, docs, commits, PRs, skills and rules are written
  in English. Conversation with the maintainer may be French.
- **Secrets**: never read, print, commit or transmit `.env`, `.env.local`,
  `.env.cloud` or any key value. `.env.example` holds placeholders only.
- **Sovereignty**: no proprietary dependency, no hosted-only service in the
  critical path. Local mode must stay fully offline-capable.
- **Compatibility**: the Python sidecars expose the contracts the TS packages
  expect; change both sides together and document the change in `docs/`.
- **Commits**: Conventional Commits, atomic, imperative, scope required
  (`feat(api): ...`).

## Definition of done

A change is done when:

1. `bun run typecheck` and `bun run test` pass (plus targeted suites when the
   change touches retrieval, auth or migrations).
2. `bun run build` succeeds when `apps/web` or a published package changes.
3. Docs in `docs/` and `README.md` are updated when behaviour, env vars or
   contracts change (`.env.example` included).
4. Local smoke commands relevant to the change were run (see
   `sps-quality-gates`).
5. The PR targets `develop`, lists the commands run and their result, and
   carries no secret, no debug log and no commented-out code.

## Skills

`.agent/skills/` contains the project playbooks, in the portable Agent Skills
format. The project configuration file points the agent client at that
directory, so the layout stays tool-agnostic. Load them by ID:

`sps-onboarding`, `sps-architecture`, `sps-backend`, `sps-web-console`,
`sps-data`, `sps-quality-gates`, `sps-provider-modes`, `sps-auth-and-secrets`,
`sps-deploy-verify`, `sps-git-release`.

`apps/api/AGENTS.md` and `apps/web/AGENTS.md` add the local rules for each app.
The full branch and PR procedure is in `docs/agent-workflow.md`.
