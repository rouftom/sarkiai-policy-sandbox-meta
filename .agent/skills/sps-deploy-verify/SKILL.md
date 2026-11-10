---
name: SarkiAI deploy and verify
description: How the API and console are deployed and checked on any host (a container web service for apps/api, a Next.js host or container for apps/web, environment variables, health and auth probes, keep-warm, rollback). Use when deploying, changing a production variable, or verifying a release.
---

# SarkiAI deploy and verify

The API and the console are deployed **separately**, and each runs on any host.
The API is a long-lived container (SSE, webhooks, WebSockets); the console is a
Next.js build. No provider SDK is imported and every setting is an environment
variable, so any Docker host, any Next.js host or an on-premise machine follows
the same steps.

## API

- Build `apps/api/Dockerfile` with the **repository root** as build context.
- Runtime: container web service, public HTTPS, streaming allowed. The image
  listens on `PORT` (default 8000).
- `deploy/api/service.example.yaml` is one host's manifest format and doubles as
  the list of variables; the Dockerfile is the portable path. Guide and mapping:
  `deploy/api/README.md`.
- Secrets live in the host dashboard, never in the repository:
  `MODEL_API_KEY`, `MONGODB_URI`, `APPROVAL_SECRET`, `SESSION_SECRET`,
  `AUTH_RESEND_KEY`, `TURNSTILE_SECRET`.
- Retrieval needs no key: the corpus is in MongoDB. `RETRIEVAL_BACKEND`
  (`auto | atlas | text`) follows the mode and `RETRIEVAL_DEPTH`
  (`lexical | fast | deep`) sets the default search depth.
- `MCP_SERVERS` lists the first-party MCP apps as a JSON array; the console's
  `NEXT_PUBLIC_MCP_SERVERS` carries the same value and is inlined at build time,
  so set both and rebuild the console.
- Set `WEB_PUBLIC_URL` to the origin users open; add `WEB_PUBLIC_URL_ALIASES`
  for a second domain or a preview host. No provider-specific preview rule.
- The client address comes from an edge-overwritten header:
  `CLIENT_IP_HEADERS` (default `cf-connecting-ip,true-client-ip,x-real-ip`; set
  the name your own edge writes). `TRUST_PROXY` is only the `request.ip`
  fallback (unset = one hop; a number; `true` only when the origin is not
  directly reachable).
- Scale notes: in-flight model work is bounded by `AI_CONCURRENCY_GLOBAL`;
  counters and rate limits are per instance. One instance is the supported
  topology today.

## Console

- Host root directory: `apps/web`; the workspace install runs from the repo. On
  a container host, build `apps/web/Dockerfile` with the repository root as
  context instead of using a framework preset.
- Variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DEFAULT_LOCALE`,
  `NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_WEB_ORIGINS`, `NEXT_PUBLIC_MCP_SERVERS`.
  `NEXT_PUBLIC_WEB_URL` is the canonical origin and the metadata base; without it,
  links fall back to `http://localhost:3000`.
- `NEXT_PUBLIC_*` values are **inlined at build time**: set them in the build
  environment and rebuild after any change, including the API address.
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
curl -s -o /dev/null -w '%{http_code}\n' https://<api-host>/v1/kb/documents   # 401
curl -s -o /dev/null -w '%{http_code}\n' https://<web-host>/setup             # 200
```

Then open the console: sign in, run one scenario tick and one readiness
dimension, confirm the run shows in `/audit`, open `/knowledge` → **Retrieval**
and check that a question returns a plan, sub-agents with their rounds and a
final context, and that the provider badge matches the configured mode.

### Which address the logs show

Every request line carries `remoteAddress` and `clientIpSource` (the header that
matched, or `socket`). Two traps:

- **A platform health check is not a client request.** Hosts probe `/health`
  from inside their own network, so it never passes through the edge: those
  lines show `clientIpSource: "socket"` and a private address
  (`10.x`, `172.16-31.x`, `192.168.x`). Seeing them is normal and says nothing
  about whether the edge forwards the client address.
- **Confirm with a real request.** Open the console or `curl` a unique path
  (`/health?probe=verify`), then read that line: `clientIpSource` must name the
  header you configured for your edge. If it says `socket`, either that header
  is not in `CLIENT_IP_HEADERS` or the origin is reachable without the edge and
  `TRUST_PROXY` needs to match the chain.

## Rollback

- API: redeploy the previous commit from the host (or roll back the service);
  the container is stateless, MongoDB and MinIO keep their data.
- Console: promote the previous build. No data migration is involved.
- Never "fix" a bad deploy by editing a secret in the repository; rotate it in
  the host dashboard and redeploy.

## Checklist before touching production

1. CI/checks green on the commit being promoted (`main`).
2. Environment deltas listed (new, changed, removed variable) and set in the
   host's dashboard or secret store **before** the deploy. Removed services leave
   dead variables: delete them rather than leaving them to mislead the next
   operator.
3. `docker compose config` still valid.
4. A rollback path exists (previous deploy id or commit).
5. After the deploy: the five probes above, plus one authenticated action.
