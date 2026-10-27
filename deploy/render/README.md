# Public API host — Render (free Docker web service)

The web app is on Vercel; the API is **not**. Vercel runs serverless/edge
functions with a 60 s (Hobby) request budget and no background process. This API
is the opposite shape:

- Fastify keeps a process alive and streams ticks over **SSE**
  (`GET /v1/runs/:id/events`).
- Meta delivers webhooks to a **stable HTTPS origin** that must answer within
  seconds, then keep working.
- The Atlas index bootstrap (`prepareCloudStores`) runs once at boot.

So the API runs as a container. **Render's free web service** is the cheapest
option that needs no credit card, gives a real HTTPS hostname and supports
streaming responses.

| Option | Card | Sleep | SSE | Verdict |
|---|---|---|---|---|
| Vercel Functions | no | n/a | 60 s cap | ✗ wrong shape |
| Cloud Run | **yes** (billing) | scale-to-zero | ✓ | best if a card exists |
| Fly.io | **yes** | no | ✓ | ✗ card required |
| Hugging Face Spaces (Docker) | no | 48 h idle | ✓ | ✓ fallback |
| **Render free** | **no** | 15 min idle | ✓ | ✓ **chosen** |

## 1. Create the service

1. Render dashboard → **New → Blueprint**.
2. Connect `rouftom/sarkiai-policy-sandbox-meta` (public repo).
3. Blueprint path: `deploy/render/render.yaml`.
4. Fill the `sync: false` variables (they are never stored in the repo):

   | Variable | Source |
   |---|---|
   | `MODEL_API_KEY` | Meta Model API key |
   | `VOYAGE_API_KEY` | Voyage dashboard |
   | `MONGODB_URI` | Atlas SRV URI (user with `readWrite` on `policy_sandbox`) |
   | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA`, `WHATSAPP_ACCESS_TOKEN` | Meta app → WhatsApp → API setup |
   | `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Meta app → WhatsApp → Configuration |
   | `WHATSAPP_RECIPIENT_WAID` | test recipient (E.164, no `+`) |
   | `APPROVAL_SECRET` | `openssl rand -hex 32` |

5. **Create Web Service**. First build ≈ 2–3 min (`oven/bun:1.1-alpine`, API only,
   no Next.js).

## 2. Point the web app at it

Render gives `https://sps-api.onrender.com` (or similar). Then:

```bash
vercel env add NEXT_PUBLIC_API_URL production   # paste the Render URL
vercel deploy --prod --yes
```

`NEXT_PUBLIC_*` is inlined at build time — a redeploy is mandatory, not optional.

## 3. Wire Meta to it

Meta app → WhatsApp → Configuration → Webhook:

- Callback URL: `https://<render-host>/v1/whatsapp/webhook`
- Verify token: the value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Subscribe to the `messages` field.

The API verifies `X-Hub-Signature-256` when `WHATSAPP_APP_SECRET` is set.

## 4. Keep it warm on demo day

Free instances sleep after 15 minutes of inactivity (cold start ~40 s). A
scheduled ping keeps it awake; `.github/workflows/keep-warm.yml` does that every
10 minutes once the repository variable `SPS_API_URL` is set:

```bash
gh variable set SPS_API_URL --body https://<render-host>
```

`GET /health` returns `{ ok: true }` and is what the blueprint uses as a health
check.

## 5. Free-tier limits

- 512 MB RAM / 0.1 CPU: enough for the engine, Voyage and Atlas do the heavy
  lifting. Long drills are bounded by `RUN_BUDGET_USD`.
- No persistent disk: the operational store is Atlas, not local disk.
- WebSocket-free by design: SSE only.

## Fallback — Hugging Face Spaces (Docker)

If Render is unavailable, create a Docker Space and push a one-file Dockerfile
that clones this repo at a pinned commit and runs the same image target:

```dockerfile
FROM oven/bun:1.1-alpine
WORKDIR /app
RUN apk add --no-cache git && git clone --depth 1 https://github.com/rouftom/sarkiai-policy-sandbox-meta .
RUN bun install --frozen-lockfile
WORKDIR /app/apps/api
EXPOSE 7860
ENV PORT=7860
CMD ["bun", "src/index.ts"]
```

Set the same variables as **Repository secrets** in the Space settings. Spaces
sleep after 48 h idle and wake on the first request.
