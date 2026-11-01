---
name: SarkiAI deploy and verify
description: How the API and console are deployed and checked — container web service for apps/api, Next.js host for apps/web, environment variables, health and auth probes, keep-warm, and rollback. Use when deploying, changing a production variable, or verifying a release.
---

# SarkiAI deploy and verify

The API and the console are deployed **separately**. The API is a long-lived
container (SSE, webhooks, WebSockets); the console is a Next.js build.

## API

- Build `apps/api/Dockerfile` with the **repository root** as build context.
- Runtime: container web service, public HTTPS, streaming allowed. The image
  listens on `PORT` (default 8000).
- Blueprint: `deploy/api/blueprint.yaml`. Guide: `deploy/api/README.md`.
- Secrets live in the host dashboard, never in the repository:
  `MODEL_API_KEY`, `VOYAGE_API_KEY`, `MONGODB_URI`, `APPROVAL_SECRET`,
  `SESSION_SECRET`, `AUTH_RESEND_KEY`, `TURNSTILE_SECRET`.
- Set `WEB_PUBLIC_URL` to the origin users open; add `WEB_PUBLIC_URL_ALIASES`
  for a second domain or a preview host. A `*.vercel.app` preview is always
  accepted.
- Scale notes: in-flight model work is bounded by `AI_CONCURRENCY_GLOBAL`;
  counters and rate limits are per instance. One instance is the supported
  topology today.

## Console

- Host root directory: `apps/web`; the workspace install runs from the repo.
- Variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DEFAULT_LOCALE`,
  `NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_WEB_ORIGINS`.
- `NEXT_PUBLIC_*` values are **inlined at build time** — rebuild after any
  change, including the API address.
- `next.config.ts` transpiles `@sps/ui`, `@sps/shared`, `@sps/theme` from
  source; no prebuild step.

## Keep-warm

`.github/workflows/keep-warm.yml` calls `GET /health` every 10 minutes once the
repository variable `SPS_API_URL` is set. Free tiers stop idle instances; this
keeps the demo responsive without a paid instance.

## Verify a release

```bash
curl -s https://<api-host>/health                     # {"status":"ok", provider:{mode,model}}
curl -s https://<api-host>/v1/auth/captcha            # {required,siteKey} in cloud
curl -s https://<api-host>/v1/auth/setup              # {initialized:true, storage, signup}
curl -s -o /dev/null -w '%{http_code}\n' https://<api-host>/v1/readiness/runs   # 401
curl -s -o /dev/null -w '%{http_code}\n' https://<web-host>/setup               # 200
```

Then open the console: sign in, run one scenario tick and one readiness
dimension, confirm the run shows in `/audit`, and check that the provider badge
matches the configured mode.

## Rollback

- API: redeploy the previous commit from the host (or roll back the service);
  the container is stateless, Mongo and Qdrant keep their data.
- Console: promote the previous build. No data migration is involved.
- Never "fix" a bad deploy by editing a secret in the repository; rotate it in
  the host dashboard and redeploy.

## Checklist before touching production

1. CI/checks green on the commit being promoted (`main`).
2. Environment deltas listed (new, changed, removed variable) and set in the
   dashboard **before** the deploy.
3. `docker compose config` and `make sandbox-config` still valid.
4. A rollback path exists (previous deploy id or commit).
5. After the deploy: the five probes above, plus one authenticated action.
