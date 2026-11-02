# API host (container web service)

The API runs as a container on any host that runs Docker images with a public
HTTPS address. It is not serverless: it keeps a process alive, streams
progress over **Server-Sent Events** (`GET /v1/runs/:id/events`), and receives
webhooks on a stable origin that must answer within seconds.

Requirements for the host:

- Docker image build from `apps/api/Dockerfile` (build context: repository root).
- A public HTTPS hostname, with streaming responses allowed.
- An outbound connection to the model provider, the embeddings provider and the
  database.
- Port: the image listens on `PORT` (most hosts inject it; the default is 8000).

## 1. Create the service

1. Create a web service from the repository, using the blueprint
   `deploy/api/blueprint.yaml` if the host supports blueprints, or the Dockerfile
   otherwise.
2. Provide the variables marked as secret (never stored in the repository):

   | Variable | Source |
   |---|---|
   | `MODEL_API_KEY` | model provider |
   | `MONGODB_URI` | database connection string (user with read and write on the application database) |
   | `WHATSAPP_*` | messaging provider app settings |
   | `APPROVAL_SECRET` | a random value, for example `openssl rand -hex 32` |
   | `TURNSTILE_SECRET` | Cloudflare Turnstile widget secret (optional; `CLOUDFLARE_TURNSITE_SITE_SECRET` is still read) |
   | `NEXT_PUBLIC_CLOUDFLARE_TURNSITE_SITE_KEY` | the same widget's public site key (optional) |
   | `TURNSTILE_HOSTNAMES` | console hostnames siteverify accepts, comma-separated (optional, but set it in production) |

   **The API refuses to start on a public cloud origin without a private
   session secret.** `SANDBOX_MODE=cloud` (or the presence of `MODEL_API_KEY`,
   which also selects the cloud profile) combined with a non-local
   `WEB_PUBLIC_URL` makes a missing `SESSION_SECRET` / `APPROVAL_SECRET` — or
   the public placeholder `change-me-approval-secret` — a startup error, not a
   warning. Anyone who knows that value could forge an operator session. Generate
   one with `openssl rand -hex 32` and set it in the host's secret settings:

   ```bash
   SESSION_SECRET=<openssl rand -hex 32>
   ```

   Session tokens are signed with it: changing the value signs every operator
   out. A local or on-premise install only logs a warning and keeps the insecure
   development key, so a LAN demo needs no configuration. The same cloud gate
   applies to `WHATSAPP_APP_SECRET`: without it, the WhatsApp webhook answers
   `503 webhook_secret_missing` instead of accepting unsigned events.

4. Bot protection (optional). The sign-up and password-reset forms ask for a
   Cloudflare Turnstile token when `SANDBOX_MODE` is `cloud` or `sovereign` and
   both keys are set. `GET /v1/auth/captcha` tells the console whether to render
   the widget and with which site key, so the web build needs no Turnstile
   variable. With no keys the check is off; if Cloudflare is unreachable
   (network, timeout, 5xx) the request is not blocked, while an explicit refusal
   still is.
   List the accepted hostnames in `TURNSTILE_HOSTNAMES` (comma-separated) to pin
   the widget domain, and allow the console's domain on the widget in the
   Cloudflare dashboard.

5. Request budgets (rate limiting). Every authenticated call is counted per
   operator: `RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_MS` for the API as a whole,
   `RATE_LIMIT_EXPENSIVE_MAX` for the routes that spend model credits
   (`/v1/readiness/*`, `/v1/scenarios/*`, `/v1/agents/*`, ingest, voice). A
   refused call answers `429` with `Retry-After` and `RateLimit-*` headers.
   Counters live in the process, so they reset on deploy and are per instance;
   `RATE_LIMIT_ENABLED=false` lifts both caps. The public auth screens keep
   their own windows (5–6 attempts per 15 minutes per IP, sign-in also capped
   per IP in addition to the per-address lockout).

6. Backpressure. Model work is capped in flight rather than queued:
   `AI_CONCURRENCY_PER_OPERATOR` (default 8, above the five parallel sector
   streams of a series) and `AI_CONCURRENCY_GLOBAL` (default 16, one instance).
   Past a cap the API answers `429` with `error: "busy"` immediately — retry
   once a run finishes. `READINESS_DIMENSION_CONCURRENCY` (default 4) bounds the
   dimensions one assessment evaluates at once (13 otherwise, per sector).
   Closing the console tab aborts the run; a readiness run stopped this way is
   saved as interrupted with the dimensions already scored, and can be resumed.
   Live voice allows one socket per operator and 20 per instance, with a 256 KiB
   frame ceiling.

7. Shutdown and database pools. On `SIGTERM`/`SIGINT` the API stops accepting,
   waits at most 20 seconds for in-flight requests, then closes its Mongo
   clients (a deploy no longer cuts a write mid-query). Every client carries
   `MONGODB_MAX_POOL_SIZE` (10) and `MONGODB_WAIT_QUEUE_TIMEOUT_MS` (5000): a
   slow cluster queues instead of holding an unbounded number of requests.

3. Start the service and wait for the first build to finish.

## 2. Point the web app at it

Once the API has a public address, set it as `NEXT_PUBLIC_API_URL` in the web
app's settings and rebuild the web app. `NEXT_PUBLIC_*` values are inlined at
build time, so a rebuild is required after any change.

## 3. Set the console's public origin

`WEB_PUBLIC_URL` is the origin used in every link the API sends (invitation,
e-mail confirmation, password reset, WhatsApp approval button). Point it at the
custom domain; the Vercel deployment address stays accepted by the CORS layer,
so the app keeps working during a domain switch and in previews:

```bash
WEB_PUBLIC_URL=https://<web-host>
WEB_PUBLIC_URL_ALIASES=https://<project>.vercel.app
```

Both are origins (scheme + host, no path). `WEB_PUBLIC_URL_ALIASES` accepts a
comma-separated list. Vercel previews of **this project** are accepted too:
`VERCEL_PROJECT_NAME` (default `sarkiai-policy-sandbox-meta`) allows
`<project>.vercel.app` and `<project>-<suffix>.vercel.app`; when
`VERCEL_TEAM_SLUG` is set, a preview host must also end with `-<team-slug>`.
Any other `*.vercel.app` host is refused, so another Vercel project cannot call
the API from a browser.

### Self-hosted and on-premise installs

Nothing breaks without configuration, which matters when the host cannot know
its own public origin (LAN address, reverse proxy, remapped port):

- `WEB_PUBLIC_URL` empty → links point at `http://localhost:3000`, and the API
  keeps the previous permissive CORS policy, so any console origin can call it.
- local-network origins are **always** accepted, whatever the mode: loopback on
  any port, private IPv4 ranges (`10/8`, `172.16/12`, `192.168/16`,
  `169.254/16`), single-label hostnames (a container or NetBIOS name) and the
  `.local`, `.internal`, `.lan`, `.home.arpa` suffixes. A remapped `WEB_PORT`, a
  LAN address or an internal DNS entry therefore needs no configuration.
- setting `WEB_PUBLIC_URL` closes the allowlist to that origin, its aliases,
  local-network origins and Vercel previews. If the console is opened through a
  *public* name that differs from `WEB_PUBLIC_URL`, list it in
  `WEB_PUBLIC_URL_ALIASES`.
- `WEB_ALLOW_ANY_ORIGIN=true` accepts every origin, for a proxy setup that
  cannot be expressed as a list.

The API authenticates with a Bearer token and sets no session cookies, so a
permissive origin cannot leak an operator session; the allow-list exists to make
the exposure explicit.

## 4. Wire the messaging webhook

In the messaging provider's dashboard, set the webhook callback to
`https://<api-host>/v1/whatsapp/webhook`, with the verify token of
`WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and subscribe to the messages field. The API
checks the request signature when `WHATSAPP_APP_SECRET` is set.

## 5. Keep it warm

Many free tiers stop idle instances. A scheduled request to `GET /health` keeps
the instance awake. The workflow `.github/workflows/keep-warm.yml` does this
every 10 minutes once the repository variable `SPS_API_URL` is set to the API
address.

`GET /health` returns `{ ok: true }` and is the health check used by the
blueprint.

## 6. Limits to plan for

- Small instances have little memory: keep the heavy work with the model and
  embeddings providers, and bound long runs with the run budget.
- Do not rely on local disk: the operational store is the database.
- Streaming uses SSE only.

## Fallback: any Docker host

If the host is unavailable, any host that runs a Docker image can run the same
target. A minimal image clones the repository at a pinned commit and starts the
API from `apps/api`, on the port the host provides.
