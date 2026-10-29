# Ingestion service

Structure-aware ingestion of country policy corpora into a jurisdiction-scoped
**Qdrant** knowledge base (dense + sparse hybrid vectors).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/health` | Liveness + active embedding model |
| POST | `/v1/ingest/text` | Ingest raw text with taxonomy |
| POST | `/v1/ingest/file` | Ingest PDF/TXT multipart (OCR fallback for scanned PDFs) |

All `POST` routes require the `X-API-Key` header matching `SERVICE_API_KEY` when set.

## Qdrant collection

`policy_chunks` with two named vectors:

- `dense`: Voyage `voyage-4`, 1024-d, cosine.
- `text`: BM25 sparse (IDF modifier) via fastembed, for hybrid search.

Payload: `country`, `jurisdiction`, `docType`, `pillar[]`, `namespace`, `version`,
`filename`, `chunkIndex`, `text`, and the structural breadcrumbs `headingPath`,
`articleNumber`, `unitType`, `chunkRole`, `parentText`, `isActive`, `contentHash`.
Keyword/bool payload indexes are created for the filter fields.

Points are keyed by a deterministic UUID of the content hash → re-ingestion is
idempotent.

## Run standalone

```bash
docker build -f services/ingestion/Dockerfile -t sps-ingestion .
docker run --rm -p 8001:8000 --env-file .env \
  -e QDRANT_URL=http://host.docker.internal:6333 \
  sps-ingestion
```

Or, from the repo root: `make ingestion` (starts Qdrant + ingestion).
