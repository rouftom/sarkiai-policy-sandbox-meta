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
   | `VOYAGE_API_KEY` | embeddings and reranking provider |
   | `MONGODB_URI` | database connection string (user with read and write on the application database) |
   | `WHATSAPP_*` | messaging provider app settings |
   | `APPROVAL_SECRET` | a random value, for example `openssl rand -hex 32` |

3. Start the service and wait for the first build to finish.

## 2. Point the web app at it

Once the API has a public address, set it as `NEXT_PUBLIC_API_URL` in the web
app's settings and rebuild the web app. `NEXT_PUBLIC_*` values are inlined at
build time, so a rebuild is required after any change.

## 3. Wire the messaging webhook

In the messaging provider's dashboard, set the webhook callback to
`https://<api-host>/v1/whatsapp/webhook`, with the verify token of
`WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and subscribe to the messages field. The API
checks the request signature when `WHATSAPP_APP_SECRET` is set.

## 4. Keep it warm

Many free tiers stop idle instances. A scheduled request to `GET /health` keeps
the instance awake. The workflow `.github/workflows/keep-warm.yml` does this
every 10 minutes once the repository variable `SPS_API_URL` is set to the API
address.

`GET /health` returns `{ ok: true }` and is the health check used by the
blueprint.

## 5. Limits to plan for

- Small instances have little memory: keep the heavy work with the model and
  embeddings providers, and bound long runs with the run budget.
- Do not rely on local disk: the operational store is the database.
- Streaming uses SSE only.

## Fallback: any Docker host

If the host is unavailable, any host that runs a Docker image can run the same
target. A minimal image clones the repository at a pinned commit and starts the
API from `apps/api`, on the port the host provides.
