---
name: SarkiAI data and knowledge base
description: How SarkiAI stores data — the MongoDB `kb_chunks` corpus with its Atlas Search or text index, the operational collections, the retrieval filter contract, indexes, seeding, re-ingestion and the demo reset. Use for schema changes, index work, corpus ingestion, retrieval filters, migrations or "where is this record stored".
---

# SarkiAI data and knowledge base

## One store for the corpus and the trail

- **MongoDB** holds the corpus (`kb_chunks`), searched lexically with Atlas
  Search in `cloud` or a text index in `local`/`sovereign`, and the operational
  documents (audit, CoT, runs, operators, metering).
- **MinIO** holds image attachments.
- There is **no vector store and no embedding field**: search is BM25, and the
  Meta model of the mode plans, judges and ranks.

The `KbChunk` type in `packages/shared/src/types.ts` is the contract.

## Corpus collection

`MONGODB_RAG_COLLECTION=kb_chunks` (default).

| Field | Kind |
| --- | --- |
| `_id` | `sha256(document, version, chunkIndex, text)` → re-ingestion is idempotent |
| `country`, `jurisdiction`, `docType`, `namespace?`, `pillar[]` | taxonomy |
| `rights` | `official-text` / `open-licence` / `quotation-only` / `to-confirm` |
| `filename`, `chunkIndex`, `text` | body |
| `headingPath`, `articleNumber`, `unitType`, `chunkRole` | structure |
| `sourceUrl`, `isActive` | provenance and retrieval gate |

Never change the collection name or the payload keys without a migration and a
docs update: the KB is a shared asset.

Filter contract (built by `corpusFilter` in `packages/retrieval/src/agentic.ts`,
not by callers):

```
isActive = true
country  = <query.country>
jurisdiction = <optional>
docType      = <optional>
namespace    = <optional>
```

In `cloud` it becomes the Atlas `compound.filter`; elsewhere it is merged into
the MongoDB `$text` query.

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

- Atlas Search: `sps_text_index` only (BM25 on `text`, `sps_fr_folded`
  analyser, filter fields `country`, `jurisdiction`, `docType`, `namespace`,
  `isActive`). Definition in
  `packages/retrieval/src/atlas-index-definitions.ts` (shipped in the API
  image), bootstrapped at startup in `cloud` mode or with
  `bun run kb:indexes [deploy/mongo/kb.indexes.json]`. Idempotent.
- MongoDB text index: created automatically at the first ingestion in `local`
  and `sovereign`.
- Mongo operational indexes are created by the store modules / bootstrap; a new
  query pattern needs a matching index.

## Ingestion

```bash
make seed                 # directory seed through the API (manifest rights enforced)
bun run kb:seed           # scripts/seed-corpus.ts, manifests → /v1/kb/ingest/text
bun run kb:seed -- --only snd30,psnsn --dry-run
```

The ingest route is admin-only: against a deployed API, export `SPS_ADMIN_TOKEN`
with a session token. The chunker is structure-aware (headings, articles);
scanned pages go through the Gazette screen (SAM 3.1) and then the same
ingestion path. A missing `rights` value fails closed to `to-confirm`.

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
