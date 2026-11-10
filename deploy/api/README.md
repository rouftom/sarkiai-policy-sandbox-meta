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

Nothing here depends on the provider. `deploy/api/service.example.yaml` is one
host's manifest format and is useful as the list of variables; any other host
maps the same settings:

| Setting | What the host must provide |
|---|---|
| Image | `docker build -f apps/api/Dockerfile .` from the repository root |
| Port | listen on `PORT`; 8000 is the image default |
| Health | `GET /health` must answer `200` |
| Instances | exactly one (rate limits and counters are in-process) |
| Streaming | no response buffering, no idle timeout shorter than a run (SSE `/v1/runs/:id/events` and the voice WebSocket) |
| Secrets | a dashboard or secret store, never the repository |
| Region | close to the database and the model provider |
| Rollback | redeploy the previous commit, or roll the service back (the container is stateless) |

## 1. Create the service

1. Create a web service from the repository, using
   `deploy/api/service.example.yaml` if the host accepts that format, or pointing
   the host at `apps/api/Dockerfile` otherwise.
2. Provide the variables marked as secret (never stored in the repository):

   | Variable | Source |
   |---|---|
   | `MODEL_API_KEY` | model provider |
   | `MONGODB_URI` | database connection string (user with read and write on the application database) |
   | `WHATSAPP_*` | messaging provider app settings |
   | `APPROVAL_SECRET` | a random value, for example `openssl rand -hex 32` |
   | `SESSION_SECRET` | a random value, for example `openssl rand -hex 32` (signs operator sessions) |
   | `BETTER_AUTH_SECRET` | the same value as `SESSION_SECRET` (encrypts TOTP secrets and recovery codes) |
   | `BETTER_AUTH_URL` | public API origin used in e-mail links (optional; `API_PUBLIC_URL` is still read) |
   | `TURNSTILE_SECRET` | Cloudflare Turnstile widget secret (optional; `CLOUDFLARE_TURNSITE_SITE_SECRET` is still read) |
   | `NEXT_PUBLIC_CLOUDFLARE_TURNSITE_SITE_KEY` | the same widget's public site key (optional) |
   | `TURNSTILE_HOSTNAMES` | console hostnames siteverify accepts, comma-separated (optional, but set it in production) |
   | `CLOUDINARY_CLOUD_NAME` | Cloudinary account name (assistant images; `MEDIA_STORE=cloudinary`) |
   | `CLOUDINARY_API_KEY` | Cloudinary API key |
   | `CLOUDINARY_API_SECRET` | Cloudinary API secret |

   **The API refuses to start on a public cloud origin without a private
   session secret.** `SANDBOX_MODE=cloud` (or the presence of `MODEL_API_KEY`,
   which also selects the cloud profile) combined with a non-local
   `WEB_PUBLIC_URL` makes a missing `SESSION_SECRET` / `APPROVAL_SECRET` (or
   the public placeholder `change-me-approval-secret`) a startup error, not a
   warning. Anyone who knows that value could forge an operator session. Generate
   one with `openssl rand -hex 32` and set it in the host's secret settings:

   ```bash
   SESSION_SECRET=<openssl rand -hex 32>
   BETTER_AUTH_SECRET=<the same value as SESSION_SECRET>
   BETTER_AUTH_URL=https://api.example.com
   ```

   Session tokens are signed with it: changing the value signs every operator
   out. `BETTER_AUTH_SECRET` also encrypts the TOTP secrets and recovery codes;
   set it to the `SESSION_SECRET` value so an existing enrolment stays readable
   (an empty value derives a stable key from `SESSION_SECRET`). `BETTER_AUTH_URL`
   is the public origin used in e-mail links; it wins over `API_PUBLIC_URL`.
   A local or on-premise install only logs a warning and keeps the insecure
   development key, so a LAN demo needs no configuration. The same cloud gate
   applies to `WHATSAPP_APP_SECRET`: without it, the WhatsApp webhook answers
   `503 webhook_secret_missing` instead of accepting unsigned events.

   Optional: `MCP_SERVERS` is the JSON array of the first-party MCP apps the
   agent may call, for example
   `[{"name":"sarkiai_charts","url":"https://charts.example/mcp","requiresApiKey":true}]`.
   Empty leaves the agent without MCP tools. The console receives the same JSON
   as `NEXT_PUBLIC_MCP_SERVERS`, which is inlined at build time.

3b. Assistant images. `MEDIA_STORE` selects the adapter: `s3` (MinIO / S3,
   the local default) or `cloudinary` (the default in `cloud` and `sovereign`
   mode). The example manifest sets `MEDIA_STORE=cloudinary` and
   `CLOUDINARY_SPS_FOLDER=sps`; chat images land in `sps/attachments`, never in
   the organization's `fada/resources` folder. Without the Cloudinary
   credentials the API logs a warning and falls back to S3 at boot, so a fork
   still runs. Only the reference (`sha256`, MIME, size, dimensions, signed or
   Cloudinary URL) is written with a conversation turn.

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
   Past a cap the API answers `429` with `error: "busy"` immediately: retry
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
custom domain:

```bash
WEB_PUBLIC_URL=https://<web-host>
WEB_PUBLIC_URL_ALIASES=https://<other-host>   # optional, comma-separated
```

Both are origins (scheme + host, no path). A preview or review host is just
another origin: add it to `WEB_PUBLIC_URL_ALIASES`.

### Client IPs behind an edge

The host's proxy terminates TLS, so the socket address is an internal one. The
API reads the caller from a header the edge **overwrites** on every request:
`CLIENT_IP_HEADERS`, an ordered comma-separated list (first valid address wins).

The default — `cf-connecting-ip,true-client-ip,x-real-ip` — names the headers the
common edges write and overwrite. Leave the variable empty when your edge uses
one of them. Set it when your edge uses another name (`X-Forwarded-For` is not a
candidate: it is appended to, so its left end is caller-controlled):

```bash
CLIENT_IP_HEADERS=x-edge-client-ip       # the name your edge overwrites
CLIENT_IP_HEADERS=cf-connecting-ip       # explicit, same as the default
CLIENT_IP_HEADERS=none                   # socket address only
```

`TRUST_PROXY` is only the fallback used when no listed header matches. It
decides how much of `X-Forwarded-For` is believed:

| Value | Use |
|---|---|
| unset | one proxy in front (the default) |
| `false` | the process is reached directly; the socket address is used |
| `2` | two proxies in the chain |
| `true` | every hop — only when the process is unreachable except through the proxy |

The header must be one your edge sets itself. On a host whose own hostname is
directly reachable, a caller can forge a header the edge does not overwrite, so
either keep the origin private to the edge or use `CLIENT_IP_HEADERS=none` with
`TRUST_PROXY` matching the chain.

To check it after a deploy, read a real request in the logs: `clientIpSource`
names the header that matched. Request lines that show `socket` with a private
address are the platform's **own health check**, which never passes through the
edge — every host does this, and it is not a sign that the header is missing.

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
- setting `WEB_PUBLIC_URL` closes the allowlist to that origin, its aliases and
  local-network origins. If the console is
  opened through a *public* name that differs from `WEB_PUBLIC_URL`, list it in
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

`GET /health` returns `{ ok: true }` and is the health check to configure on the
host.

## 6. Limits to plan for

- Small instances have little memory: keep the heavy work with the model and
  embeddings providers, and bound long runs with the run budget.
- Do not rely on local disk: the operational store is the database.
- Streaming uses SSE only.

## Portability: any Docker host

No step above depends on the reference host. When the current provider is
unavailable, or the deployment must move (sovereignty, cost, an existing
Kubernetes cluster), any host that runs a Docker image can run the same service:

- build `apps/api/Dockerfile` with the repository root as context;
- inject `PORT` (or let the image default to 8000) and the same environment
  variables;
- expose it over HTTPS with streaming allowed, one instance;
- point `WEB_PUBLIC_URL` and `NEXT_PUBLIC_API_URL` at the new address.

A minimal alternative image can also clone the repository at a pinned commit and
start the API from `apps/api`, on the port the host provides.
