# Repository rules

Standalone repository for the policy sandbox engine. It must NOT depend on
proprietary/unpublished modules of `sarkiai-enterprise` (notably the AgenticUI
harness). Adapt-and-reuse is fine; keep this repo publishable.

## Environment

- **Bun** is the package manager (`bun install`, `bun run <script>`).
- **Node ≥ 20**. Python ≥ 3.11 for the services.
- Never commit real env files or secrets. `.env.example` / `*.example` only.

## Naming

- Files and directories: `kebab-case`.
- TypeScript packages: `@sps/<name>`, entry `src/index.ts`, ESM (`"type": "module"`).
- Python packages: `snake_case` modules.

## Branches & commits

- `main` — stable.
- `feat/<scope>` — feature work.
- Commits: single line, prefixed `feat()`, `fix()`, `docs()`, `refactor()`,
  `chore()`, with a scope: `feat(kb): add jurisdiction filter`.

## UI/UX charter (SarkiAI Compact)

Reuse the same charter as the main SarkiAI apps:

- Tailwind v4 CSS-first: tokens in `packages/ui/src/styles/tokens.css`, mapped in
  each app via `@theme inline`.
- **Multi-theme** packs via `html[data-theme-pack]` + `--portal-dark`; dark mode
  via `.dark`. Browser chrome themed pre-paint (`apps/web/src/lib/chrome-theme.ts`).
- Compact density: inputs `h-7`, buttons `h-8`; labels `text-[10px] font-black
  tracking-widest` (no uppercase).
- Premium surfaces: `backdrop-blur-sm`, `rounded-xl`, light/dark border parity.
- **Floating assistant panel**: backdrop `z-[105]`, panel `z-[110]`, bottom-center
  avatar when minimised, popovers `z-[130]`, dialogs `z-[150]`.
- i18n: add keys to all locales at once; never render localized objects directly.

## Verification

- TypeScript: `bun run typecheck`.
- Compose: `docker compose config` (and the sandbox file via `make sandbox-config`).
- Python services: `python -m compileall services/<svc>/src` (or `app`).

## Boundaries

- Do not import from `@sarkiai/*` or the agentic harness.
- Keep the public API (chunk shape, index names) stable — the KB is a shared asset.
