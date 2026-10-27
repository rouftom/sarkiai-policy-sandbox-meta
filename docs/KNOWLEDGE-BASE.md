# Knowledge base and retrieval

How a document becomes a citable chunk, and how a question becomes a ranked
context window. The console exposes every step at `/knowledge`; the same steps
run from the API and from `bun run kb:seed`.

## 1. Two backends, one contract

| Mode | Dense | Sparse | Fusion | Rerank | Store |
|---|---|---|---|---|---|
| `cloud` | Voyage `voyage-4` (1024d, dotProduct) | Atlas `$search` (BM25) | RRF | Voyage `rerank-2` | MongoDB Atlas `kb_chunks` |
| `sovereign` / `local` | `bge-m3` (Ollama) | Qdrant sparse BM25 | RRF | optional TEI | Qdrant `policy_chunks` |

Both write the same `KbChunk` payload (`packages/shared`), so a chunk keeps its
jurisdiction taxonomy (`country`, `jurisdiction`, `docType`, `namespace`) and
its structural breadcrumbs (`headingPath`, `articleNumber`) whichever backend
serves it. Citations are validated against the chunk text, so provenance is not
decorative.

`RETRIEVAL_BACKEND=auto` follows the provider mode. Local MongoDB has no Atlas
Search, so `sovereign` and `local` never attempt to create the indexes.

## 2. Ingestion, six steps

`POST /v1/kb/ingest/text` and `POST /v1/kb/ingest` (cloud mode) run
`AtlasIngestor` in-process — the optional Python service is no longer on the
cloud path. Each step returns a status, a human detail and a duration, which is
what the **Vectorise** tab renders as the ingestion journal.

1. **Accept** — trim, size bounds (24 chars … 2,000,000 chars), taxonomy
   defaults (`country=global`, `jurisdiction=national`, `docType=policy`).
2. **Chunk** — `chunkDocument` (`packages/kb/src/chunk.ts`, deterministic, unit
   tested). Headings (`#`, `ARTICLE 7`, `SECTION 3`, short ALL-CAPS lines) open a
   section; paragraphs are merged up to `maxChars` (default 1500) with
   `overlapChars` (default 180) carried over; over-long paragraphs are split on
   sentence boundaries. Each chunk keeps the heading path and the article
   number.
3. **Embed** — only chunks whose content hash is new are sent to Voyage, in
   batches of 64. Re-ingesting an unchanged document performs **no** embedding
   call and reports `Embedding skipped`.
4. **Upsert** — `_id` is `sha256(document, version, chunkIndex, text)`, so writes
   are idempotent. A chunk from a previous chunking of the same filename that is
   no longer produced is set `isActive: false` (retired, still auditable).
5. **Index** — inspect `sps_vector_index` / `sps_text_index`; create or update
   when missing (unless `autoIndexes: false`). Atlas builds asynchronously, so
   the step distinguishes *present* from *queryable*.
6. **Verify** — recount active chunks for the document and return the totals.

Limits: 1500 chunks per document (enough for a 700 KB strategy PDF), 8 MB request
body. Scanned PDFs have no text layer and must go through the Gazette screen,
which transcribes zones and then calls the same ingestion path.

## 3. Index definitions live in code

`packages/retrieval/src/atlas-index-definitions.ts` is the canonical definition.
It cannot live only under `deploy/`: the API image ships `packages/` and
`apps/api/`, so reading a file from `deploy/` at boot silently failed and the
indexes were never created on the host. `deploy/mongo/kb.indexes.json` remains
the artifact for `bun run kb:indexes`; a test asserts the two are identical.

- `sps_vector_index` — `vectorSearch` on `embedding` (1024 dims, dotProduct),
  filter fields `isActive`, `country`, `jurisdiction`, `docType`, `namespace`.
- `sps_text_index` — `search` over `text` with a custom analyser,
  `sps_fr_folded` (`standard` tokenizer → `lowercase` → `asciiFolding`), so an
  unaccented query matches accented French. Filter fields are typed `token`, not
  `string`: with `string` the analyser lowercases `country`, and a filter on
  `country: "cm"` matched nothing.

Both are created at startup in cloud mode (`ensureAtlasIndexes`) and on demand
from the console (`POST /v1/kb/indexes`). Creation is idempotent: unchanged
definitions are skipped, changed ones are recreated.

## 4. Query pipeline

`AtlasRetriever.explore()` returns the stages instead of hiding them:

```
question
  └─ Voyage embed (input_type=query)
       ├─ $vectorSearch  → dense[]   (vectorSearchScore)
       └─ $search BM25   → sparse[]  (BM25 score)
            └─ RRF fusion         → fused[]
                 └─ rerank-2      → reranked[]  (cross-encoder score)
                      └─ top K    → final[]     ← what the agents read
```

`POST /v1/kb/search` returns all five lists with `id`, `rank`, `score`,
`filename`, `chunkIndex`, condensed `text`, `headingPath`, `articleNumber` and
`sourceUrl`, plus the exact Atlas filter, the embedding/rerank model names, the
per-stage timings and any warnings (a failed branch degrades instead of throwing).

Score semantics differ by stage and are not comparable across stages: dense is a
cosine-like similarity, BM25 is unbounded, RRF is `Σ 1/(k + rank)` and rerank is
a model probability. The UI labels each stage so nobody reads a BM25 score of
5.6 as "better than 0.84".

## 5. Operating the corpus

```bash
# seed from data/country/cm/manifest.json (pdftotext for PDFs)
SPS_API_URL=https://sps-api.example bun run kb:seed
bun run kb:seed -- --only snd30,psnsn
bun run kb:seed -- --dry-run

# indexes only
MONGODB_URI=... MONGODB_DB_NAME=policy_sandbox bun run kb:indexes
```

`/knowledge` → **Corpus** lists documents, **Retire/Restore** flips `isActive`
for every chunk of one document (audit keeps the rows; retrieval stops seeing
them), **Vectorise** runs one document with a journal, **Retrieval** is the
playground, and the index card repairs the Atlas indexes.

Reference state at submission time (cloud mode, Cameroon corpus):
8 documents, 2,166 active chunks, 1,722,491 characters, 1024 dimensions, both
indexes `READY`, retrieval producing 100 dense + 100 sparse → 158 fused → 3
reranked in ~1.5 s.

## 6. What this is not

- No OCR and no PDF parsing in the API: text comes from the client, from
  `pdftotext`, or from the Gazette pipeline.
- No automatic re-embedding when the embedding model changes; `status` reports
  `missingVectors` and `mismatchedVectors` so the mismatch is visible instead of
  silent.
- No per-chunk ACLs. Jurisdiction scoping is the filter (`country`,
  `jurisdiction`, `docType`, `namespace`); tenancy beyond that is out of scope
  for the sandbox.
