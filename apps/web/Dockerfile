# Build context: repository root
# ── base ─────────────────────────────────────────────────────────────────────
# Bun 1.4 reads the text `bun.lock`; keep this aligned with the lockfile.
FROM oven/bun:1.4.2-alpine AS base
WORKDIR /app

COPY package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web/package.json ./apps/web/package.json

RUN bun install --no-save

# ── dev (hot reload) ─────────────────────────────────────────────────────────
FROM base AS dev
COPY apps/web ./apps/web
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["bun", "run", "dev"]

# ── builder ──────────────────────────────────────────────────────────────────
FROM base AS builder
COPY apps/web ./apps/web
WORKDIR /app/apps/web
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Canonical console origin and extra allowed origins. Both are read at build
# time; an empty value falls back to the host's own origin, then localhost.
ARG NEXT_PUBLIC_WEB_URL
ARG NEXT_PUBLIC_WEB_ORIGINS
ENV NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL
ENV NEXT_PUBLIC_WEB_ORIGINS=$NEXT_PUBLIC_WEB_ORIGINS
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ── runner (Next standalone) ─────────────────────────────────────────────────
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --retries=5 --start-period=30s \
  CMD node -e "fetch('http://localhost:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
