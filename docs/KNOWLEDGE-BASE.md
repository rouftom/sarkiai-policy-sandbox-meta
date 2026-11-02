# Knowledge base and retrieval

How a document becomes a citable chunk, and how a question becomes a ranked
context window. The corpus lives in MongoDB (`KbChunk` documents in the
collection `kb_chunks`); the console exposes every step at `/knowledge`, and the
same steps run from the API and from `bun run kb:seed`. There is no vector store:
search is lexical (BM25) and the Meta model of the mode plans, judges and ranks.

## 1. Two index backends, one contract

| Mode | Index | Store | Model |
|---|---|---|---|
| `cloud` | Atlas Search (`sps_text_index`, BM25) | MongoDB Atlas `kb_chunks` | the newest Muse Spark the key lists |
| `sovereign` / `local` | MongoDB text index | local MongoDB `kb_chunks` | Muse Spark Open (Baseten) / Muse Glimmer (Ollama) |

Both index the same `KbChunk` payload (`packages/shared`), so a chunk keeps its
jurisdiction taxonomy (`country`, `jurisdiction`, `docType`, `namespace`) and
its structural breadcrumbs (`headingPath`, `articleNumber`) whichever backend
serves it. Citations are validated against the chunk text, so provenance is not
decorative.

`RETRIEVAL_BACKEND=auto` follows the provider mode: Atlas Search in `cloud`, a
MongoDB text index in `local` and `sovereign`. A local MongoDB has no Atlas
Search, so those modes never attempt to create an Atlas index; the text index is
created at the first ingestion.

## 2. Ingestion, six steps

`POST /v1/kb/ingest/text` and `POST /v1/kb/ingest` run `AtlasIngestor`
(`packages/retrieval/src/atlas-ingest.ts`) in-process in every mode. Each step
returns a status, a human detail and a duration, which is what the
**Ingest** tab renders as the ingestion journal.

1. **Accept**: trim, size bounds (24 chars … 2,000,000 chars), rights gate,
   taxonomy defaults (`country=global`, `jurisdiction=national`, `docType=policy`).
2. **Chunk**: `chunkDocument` (`packages/kb/src/chunk.ts`, deterministic, unit
   tested). Headings (`#`, `ARTICLE 7`, `SECTION 3`, short ALL-CAPS lines) open a
   section; paragraphs are merged up to `maxChars` (default 1500) with
   `overlapChars` (default 180) carried over; over-long paragraphs are split on
   sentence boundaries. Each chunk keeps the heading path and the article
   number.
3. **Store**: only chunks whose content hash is new are written. Re-ingesting an
   unchanged document is a no-op and reports `no change`.
4. **Upsert**: `_id` is `sha256(document, version, chunkIndex, text)`, so writes
   are idempotent. A chunk from a previous chunking of the same filename that is
   no longer produced is set `isActive: false` (retired, still auditable).
5. **Index**: inspect `sps_text_index` (Atlas) or the MongoDB text index; create
   or update when missing (unless `autoIndexes: false`). Atlas builds
   asynchronously, so the step distinguishes *present* from *queryable*.
6. **Verify**: recount active chunks for the document and return the totals.

Limits: 1500 chunks per document (3000-character chunks above 800 000
characters). Scanned pages have no text layer: they go through the Gazette
screen (`packages/gazette`), which segments the page with SAM 3.1 and then calls
the same ingestion path.

## 3. Index definitions live in code

`packages/retrieval/src/atlas-index-definitions.ts` is the canonical definition:
a single `sps_text_index` `search` index over `text` with a custom analyser,
`sps_fr_folded` (`standard` tokenizer → `lowercase` → `asciiFolding`), so an
unaccented query matches accented French. Filter fields (`country`,
`jurisdiction`, `docType`, `namespace`) are typed `token`, not `string`: with
`string` the analyser lowercases `country`, and a filter on `country: "cm"`
matched nothing; `isActive` is a boolean.

The definition lives in code because the API image only ships `packages/` and
`apps/api/`; reading a file from `deploy/` at boot silently failed and the index
was never created on the host. `deploy/mongo/kb.indexes.json` remains the
artifact for `bun run kb:indexes`; a test asserts the two are identical.

The index is created at startup in cloud mode (`ensureAtlasIndexes`) and on
demand from the console (`POST /v1/kb/indexes`). Creation is idempotent:
unchanged definitions are skipped, changed ones are recreated.

## 4. Query pipeline

`AgenticRetriever.explore()` returns the stages instead of hiding them:

```
question
  └─ plan (Meta model)           → sub-questions + legal queries
       ├─ sub-agent 1 ─ BM25 ─┐
       ├─ sub-agent 2 ─ BM25 ─┼─ RRF fusion → article passages
       └─ sub-agent 3 ─ BM25 ─┘      └─ judge (deep) → refined queries
                                         └─ rank (Meta model) → final[] ← what the agents read
```

`POST /v1/kb/search` returns the plan, each sub-agent with its rounds and hits,
the fused list and the final list, with `id`, `rank`, `score`, `filename`,
`chunkIndex`, condensed `text`, `headingPath`, `articleNumber` and `sourceUrl`,
plus the filter, the model name, the timings and any fallback. Depths:
`lexical` (no model call), `fast` (plan + rank) and `deep` (parallel sub-agents
and judge loops). `RETRIEVAL_DEPTH` sets the default.

Scores are not comparable across stages: BM25 is unbounded, RRF is
`Σ 1/(k + rank)` and the model ranking is an order, not a probability. The UI
labels each stage so nobody reads a BM25 score of 5.6 as "better than 0.84".

## 5. Operating the corpus

```bash
# index the corpus manifests through the API (the ingest route is admin-only)
SPS_API_URL=https://sps-api.example SPS_ADMIN_TOKEN=... bun run kb:seed
bun run kb:seed -- --only snd30,psnsn
bun run kb:seed -- --dry-run

# or seed a directory from the local docker stack (manifest rights enforced)
make seed

# after a rights change: report, then delete restricted documents
MONGODB_URI=... bun run kb:purge
MONGODB_URI=... bun run kb:purge -- --apply

# Atlas index only
MONGODB_URI=... MONGODB_DB_NAME=policy_sandbox bun run kb:indexes
```

The rights gate is enforced at every ingestion path: `official-text` and
`open-licence` documents may be chunked and stored, `quotation-only` and
`to-confirm` ones are refused with a 403, and a missing `rights` field fails
closed to `to-confirm`. `scripts/seed.sh` reads the directory's `manifest.json`
(or requires `--rights`) and skips any document whose rights are not publishable.
See [`LICENSING.md`](LICENSING.md).

`/knowledge` → **Corpus** lists documents, **Retire/Restore** flips `isActive`
for every chunk of one document (audit keeps the rows; retrieval stops seeing
them), **Ingest** runs one document with a journal, **Retrieval** is the
playground, and the index card repairs the search index.

Snapshot at the time of writing (cloud mode, Cameroon corpus): 22 documents and
6 096 active chunks, `sps_text_index` `READY`, retrieval returning a plan, three
sub-agents with their rounds, and a ranked context. Treat those counts as an
order of magnitude: the live numbers are on `/knowledge`.

## 6. What this is not

- No OCR and no PDF parsing in the API: text comes from the client, from
  `pdftotext`, or from the Gazette vision pipeline.
- No embeddings, no vector index and no reranker model: the corpus is searched
  lexically, and the Meta model of the mode does the ranking. Re-ingesting is
  therefore never needed after a model switch.
- No per-chunk ACLs. Jurisdiction scoping is the filter (`country`,
  `jurisdiction`, `docType`, `namespace`); tenancy beyond that is out of scope
  for the sandbox.
