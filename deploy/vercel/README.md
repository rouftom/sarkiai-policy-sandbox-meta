# Vercel — web app (`apps/web`)

The Next.js app is deployed on Vercel; the Fastify API is not (see
`deploy/render/README.md`).

| Setting | Value |
|---|---|
| Team | `djottaroots-projects` |
| Project | `sarkiai-policy-sandbox-meta` |
| Root Directory | `apps/web` |
| Framework Preset | Next.js |
| Install Command | *(default)* — Vercel detects the bun workspace at the repo root |
| Build Command | default (`turbo run build --filter=@sps/web`) |
| Node.js | 24.x |
| Output | Next.js default (`output: 'standalone'` is honoured by Vercel's builder) |

Production alias: **https://sarkiai-policy-sandbox-meta.vercel.app**

## Environment variables

| Variable | Production value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<render-host>` | **Inlined at build time** — redeploy after any change |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `en` | UI is bilingual; English is the default |

```bash
vercel env add NEXT_PUBLIC_API_URL production
vercel env add NEXT_PUBLIC_DEFAULT_LOCALE production
vercel deploy --prod --yes
```

## Why the root directory is `apps/web`

The repo is a bun workspace (`apps/*`, `packages/*`). Pointing Vercel at the
workspace root would make it guess a framework; pointing it at `apps/web` lets
its Next.js builder own the output while its monorepo detection installs the
whole workspace at the repo root. `next.config.ts` already transpiles the
workspace packages from source (`@sps/ui`, `@sps/shared`, `@sps/theme`), so no
prebuild step is needed.

Project settings are applied over the REST API because the CLI has no
`project update` command:

```bash
PATCH https://api.vercel.com/v9/projects/<projectId>?slug=djottaroots-projects
{ "rootDirectory": "apps/web", "framework": "nextjs" }
```

## What this deployment does *not* do

- It does not host the API, the webhook or the SSE stream.
- It does not run the Atlas bootstrap (`bun run kb:indexes` is a one-off, run
  from a machine that can reach Atlas).
- `.env` / `.env.cloud` are git-ignored and never uploaded.

## Deploying from the CLI

```bash
vercel link --yes --project sarkiai-policy-sandbox-meta   # once
vercel deploy --prod --yes
```

`.vercel/project.json` holds the project and org ids (git-ignored). Deployments
are uploaded from the repo root, `apps/web` being the project root.
