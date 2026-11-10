# Web app (`apps/web`)

The Next.js console is deployed to any host that runs Next.js, or as a container
(`apps/web/Dockerfile`). The API is deployed separately (see
`deploy/api/README.md`).

## Project settings

| Setting | Value |
|---|---|
| Root directory | `apps/web` |
| Framework | Next.js |
| Install command | default: the host detects the bun workspace at the repository root |
| Build command | default (`turbo run build --filter=@sps/web`) |
| Node.js | 24.x |
| Output | Next.js default (`output: 'standalone'` is honoured by most builders) |

A host without a "root directory" setting builds the workspace and runs
`turbo run build --filter=@sps/web`. A container host builds
`apps/web/Dockerfile` with the repository root as context and passes the
`NEXT_PUBLIC_*` values as build arguments.

## Environment variables

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | the public address of the API | **Inlined at build time**: rebuild after any change |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `en` | The UI is bilingual; English is the default |
| `NEXT_PUBLIC_WEB_URL` | the console's canonical origin | Absolute metadata URLs; without it, `http://localhost:<NEXT_PUBLIC_WEB_PORT>` |
| `NEXT_PUBLIC_WEB_ORIGINS` | extra accepted origins | Comma-separated |

Set the variables in the host's dashboard or with its CLI, for the production
environment, then deploy.

`NEXT_PUBLIC_WEB_URL` and `NEXT_PUBLIC_WEB_ORIGINS` are read at build time: pass
them as build arguments (`docker build --build-arg ...`) when building an image.
They are optional. Server Actions accept a request whose `Origin` matches the
`Host` header, so an on-premise console opened through a LAN name, an internal
DNS entry or a remapped port works without listing anything; the list only
matters behind a reverse proxy that rewrites the host. A preview host is just
another origin: add it to `NEXT_PUBLIC_WEB_ORIGINS`. `NEXT_PUBLIC_WEB_URL` is
also the metadata base, and no platform URL is assumed: set it in production.

## Why the root directory is `apps/web`

The repository is a bun workspace (`apps/*`, `packages/*`). Pointing the host at
the workspace root would make it guess the framework. Pointing it at `apps/web`
lets the Next.js builder own the output, while the monorepo detection installs
the whole workspace at the repository root. `next.config.ts` already transpiles
the workspace packages from source (`@sps/ui`, `@sps/shared`, `@sps/theme`), so
no prebuild step is needed.

## What this deployment does not do

- It does not host the API, the webhooks or the streaming endpoints.
- It does not create the database indexes (see `docs/KNOWLEDGE-BASE.md`).
- Local environment files (`.env*`) are git-ignored and never uploaded.
