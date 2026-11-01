---
name: SarkiAI data and knowledge base
description: How SarkiAI stores data — the Qdrant/Atlas policy chunks, the MongoDB operational collections, the retrieval filter contract, indexes, seeding, re-ingestion and the demo reset. Use for schema changes, index work, corpus ingestion, retrieval filters, migrations or "where is this record stored".
---

# SarkiAI data and knowledge base

## Two stores, two jobs

- **Qdrant** (`local`, `sovereign`) or **MongoDB Atlas** (`cloud`): the vector
  knowledge base. Never the audit trail.
- **MongoDB**: operational documents only — audit, CoT, runs, operators,
  metering. **No vectors.**

The `KbChunk` type in `packages/shared/src/types.ts` is the contract shared by
both retrieval backends.

## Retrieval collection

`QDRANT_COLLECTION=policy_chunks` (local) / `MONGODB_RAG_COLLECTION=kb_chunks`
(cloud).

| Vector | Kind | Source |
| --- | --- | --- |
| `dense` | 1024-d, cosine | `bge-m3` via Ollama (local), Voyage `voyage-4` (cloud) |
| `text` | sparse, IDF | BM25 (`Qdrant/bm25`) |

Payload: `country` (ISO-3166 or `global`, primary filter), `jurisdiction`,
`docType`, `pillar[]`, `namespace?`, `filename`, `chunkIndex`, `text`,
`headingPath`, `articleNumber`, `unitType`, `chunkRole`, `parentText`,
`sourceUrl`, `contentHash`, `isActive`.

Point id = `uuid5(contentHash)` → re-ingestion is idempotent. Never change the
collection name or the payload keys without a migration and a docs update: the
KB is a shared asset.

Filter contract (built by the retriever, not by callers):

```
isActive = true
country  = <query.country>
jurisdiction = <optional>
docType      = <optional>
namespace    = <optional>
```

## Operational collections

| Collection | Contents |
| --- | --- |
| `audit_logs` | hash-chained actions (`prevHash`, `hash`); `verifyChain()` detects the first break |
| `audit_logs_head` | chain head |
| `cot_traces` | one document per reasoning step, keyed by `runId` |
| `usage_events` | metered calls: route, model, tokens, units, cost; **no prompt or answer** |
| per-domain stores | `scenario_runs`, `readiness_runs`, `exercise_reports`, `notification_contacts`, `chat_sessions`, `countries`, `approvals` |

Each store lives in its own `apps/api/src/<domain>.ts` module with typed
records and a colocated test. Cross-operator reads by an administrator append
an `observability.read` audit record.

## Indexes

- Atlas Search/Vector indexes: definitions in
  `packages/retrieval/src/atlas-index-definitions.ts` (shipped in the API
  image), bootstrapped at startup in `cloud` mode or with
  `bun run kb:indexes [deploy/mongo/kb.indexes.json]`. Idempotent.
- Local Qdrant payload indexes: `country`, `jurisdiction`, `docType`,
  `namespace` (keyword) and `isActive` (bool).
- Mongo operational indexes are created by the store modules / bootstrap; a new
  query pattern needs a matching index.

## Ingestion

```bash
make seed                 # sample Cameroon corpus through services/ingestion
bun run kb:seed           # scripts/seed-corpus.ts (direct)
make ingestion            # qdrant + ingestion only
```

The chunker is structure-aware (headings, articles) with an OCR fallback for
scanned PDFs; OCR failure never blocks a text-native document. In `cloud` mode
the same chunks are embedded with Voyage and written to Atlas.

## Changing data safely

1. Update the type in `packages/shared` first, then producers, then readers.
2. Never rewrite an existing collection in place without a backup step and a
   documented rollback.
3. Re-ingestion is safe (content hash ids); deletion is not — prefer
   `isActive: false`.
4. `bun run demo:reset -- --dry-run` then `-- --yes` wipes accounts and
   operational collections but leaves `kb_chunks` and config untouched. It
   needs `MONGODB_URI` and prints no secret.
5. Document any schema change in `docs/DATA-MODEL.md`.
