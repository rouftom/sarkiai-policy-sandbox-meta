# Build context: repository root
# ── base ─────────────────────────────────────────────────────────────────────
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

COPY package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json

RUN bun install --no-save

# ── dev (hot reload) ─────────────────────────────────────────────────────────
FROM base AS dev
COPY apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 8000
CMD ["bun", "--watch", "src/index.ts"]

# ── prod ─────────────────────────────────────────────────────────────────────
FROM base AS prod
COPY apps/api ./apps/api
WORKDIR /app/apps/api
ENV NODE_ENV=production
# Most container hosts inject PORT; keep 8000 as the image default.
ENV PORT=8000
EXPOSE 8000 10000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=20s \
  CMD bun -e "fetch('http://localhost:'+(process.env.PORT??8000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "src/index.ts"]
