# Cameroon corpus (CM): sourcing and ingestion

Goal: build the national knowledge base, scoped to `country=cm`, then the
external reference (`country=global`) the gap engine compares it against.

## 1. Machine-readable inventory

- National corpus: [`data/country/cm/manifest.json`](../data/country/cm/manifest.json)
- International standards: [`data/global/standards/manifest.json`](../data/global/standards/manifest.json)
- African regional reference: [`data/global/africa/manifest.json`](../data/global/africa/manifest.json)

Each entry carries a `status`:

| `status` | Meaning |
|----------|---------|
| `verified` | public instrument whose number and title are reliable |
| `present` | payload copied locally (PDF/TXT stay out of git) |
| `to_confirm` | **check before ingestion** (number, version in force, official URL) |

> Golden rule: a factual error in the KB propagates into the agents' answers.
> Never ingest a text marked `to_confirm` without confirming it first.

## 2. Official issuers to prefer

| Issuer | Role |
|--------|------|
| Presidency / Prime Minister's Office | constitution, decrees, founding texts |
| National Assembly | laws |
| MINPOSTEL | digital strategy, telecoms, AI |
| Ministry of Public Health | health framework law, e-health |
| ANTIC | cybersecurity, technical mandates |
| ART | electronic communications |
| Data Protection Authority | personal data protection |
| MINEPAT / SND30 | development strategy |
| OAPI / African Union | intellectual property, regional treaties |

## 3. Document types → readiness dimensions

| Type (`docType`) | Dimensions mainly informed |
|------------------|----------------------------|
| `law` | ai_policies, human_interface |
| `strategy` | contextualization, digital_infrastructure |
| `regulation` | ai_policies, human_interface |
| `policy` | cross_domain, ai_integration |
| `treaty` | data_marketplace, human_interface |
| `guidance` / `standard` (global) | all: the external benchmark |

## 4. Ingestion procedure

```bash
# 1. place the files (PDF/TXT) in data/country/cm/
cp /path/to/law.pdf data/country/cm/

# 2. ingest (Qdrant + local bge-m3): the chunker keeps TITLE/CHAPTER/ARTICLE
#    rights come from data/country/cm/manifest.json; restricted files are skipped
./scripts/seed.sh --country cm --doc-type law --dir data/country/cm

# 3. external reference corpus
./scripts/seed.sh --country global --jurisdiction international --doc-type guidance --dir data/global/standards
./scripts/seed.sh --country global --jurisdiction regional --doc-type strategy --dir data/global/africa
```

The ingestion service switches to OCR (`services/ocr`) on its own for scanned
PDFs (official gazettes).

The regional folder holds continental and regional instruments only. National
strategies of other countries are deliberately not part of the reference corpus:
the benchmark must not depend on another jurisdiction's policy choices.

## 5. Quality check (before submission)

1. **Coverage**: every readiness dimension has at least one national provision
   and at least one external reference.
2. **Retrieval**: `POST /v1/agents/ask` on 5–10 reference questions; the
   citations must point at the right article.
3. **Gaps**: `POST /v1/readiness/report`; each gap must cite a national source
   **and** a good-practice reference.
4. **Asymmetry**: the health scenario releases its events in blocks, and each
   agent sees only what concerns it.

## 6. Ethics, rights and legality

- **Access is not a licence.** Publicly readable documents are not automatically
  redistributable. Check the `rights` field of each manifest entry.
- **Official texts** (laws, decrees, regulations, codes, official compilations)
  are generally outside copyright under Cameroonian law and may be ingested and
  cited with their issuer.
- **Other works** (press articles, journal articles, research papers, some
  reports) keep their own terms: use an explicit licence when there is one, get
  permission, or quote short passages with attribution. Never republish the full
  text under CC BY 4.0.
- **Payloads stay out of git.** Only the manifest is versioned, so the public
  repository does not redistribute the documents.
- Never ingest personal data: the corpus is regulatory, not nominal.
- Always record the issuing authority, the original URL and the `rights` status.

See [`LICENSING.md`](LICENSING.md) for the decision rule and the takedown
process.
