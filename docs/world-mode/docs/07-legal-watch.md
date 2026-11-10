# 07 — Legal watch (roadmap M4)

Goal: keep each country's corpus current **without ever letting unvetted text into it**. This is roadmap **M4 ("Automated legal watch")** scoped to what the World page needs: discovery, rights check, a human validation queue, ingestion through the existing ingestor, and a readiness refresh.

## 1. Two different web uses (do not mix)
| Use | Exists today | Effect |
|---|---|---|
| **Live web consult inside a readiness run** (`useWeb`, `webSources` on a `DimensionScore`) | Yes, `WebSearch` from `@sps/agents` (model-grounded search returning `text`, `sources`, `citations`) | Informs the assessment text of that run; **does not change the corpus** |
| **Legal watch** (this document) | New | Proposes new/amended legal texts for the **corpus**, after human validation |

## 2. Mode gating (ADR-009)
- `SANDBOX_MODE=local`: **no outbound call**; online steps are disabled and say why. Offline bundle import (§8) still works.
- `sovereign` / `cloud`: online steps require `WORLD_WATCH_ENABLED=true` (default `false`) and the provider's web capability (the same condition that makes `webSearch` available in `engine.ts`). The console badge already shows the provider; the watch screen shows "online" or "offline" explicitly. Every online job is recorded in the audit chain, consistent with "cloud is an explicit, operator-chosen exception".

## 3. Pipeline
```
scope → discovery → source filter → guarded fetch → text extraction → dedupe
 → metadata extraction (structured) → excerpt verification → rights assessment
 → proposal (pending) → human decision → ingest (existing ingestor) → [impact analysis] → [readiness refresh]
```

1. **Scope**: country, a sector, a known source, "check for updates" (re-check existing manifest documents by hash), group of countries.
2. **Discovery**: queries built from templates in the country's languages (`registry.languages`), run through the existing `WebSearch`. Queries and returned sources are stored as the **search trace**.
3. **Source filter**: per-country `data/country/<code>/watch-sources.json` (new, reviewed by two people) lists tier-1 domains (official gazette, parliament, ministries, regulators) and tier-2 (regional/international bodies). Only tier-1/2 produce proposals; others are logged and ignored; an admin can run a one-off discovery to *suggest* new domains (never auto-added).
4. **Guarded fetch** (`packages/world/src/safe-fetch.ts`, new): `http(s)` only; DNS resolved and checked against private/loopback/link-local/metadata ranges; limited, revalidated redirects; size cap (default 20 MB), MIME allow-list (HTML, PDF, text), timeout, per-domain rate limit (≥ 1 s), `robots.txt` honoured, content cache keyed by URL + ETag.
5. **Text extraction**: HTML to text; PDF text, with the existing gazette pipeline (`@sps/gazette`, SAM-based layout, per-zone transcription) for scanned gazettes when the provider supports it.
6. **Dedupe**: content hash against `kb_chunks` documents (the ingestor is already hash-idempotent) and against pending proposals.
7. **Metadata extraction**: `generateStructured` (existing, zod-validated) extracts title, authority, `docType`, `jurisdiction` (including `subnational` with its `subdivision`), date, status (in force / amended / repealed if stated). The fetched text is passed as **data in delimited blocks**; the extractor has **no tools**; its output is schema-validated; unknown fields are dropped.
8. **Excerpt verification**: the proposal stores a ≤ 400-char excerpt that **must occur verbatim** in the fetched text (normalised whitespace/case); otherwise the proposal is rejected automatically. The verification is code, independent of the model.
9. **Rights assessment** → `CorpusRights` (`official-text | open-licence | quotation-only | to-confirm`): official-gazette domain and legislative text → candidate `official-text`; explicit licence statement → `open-licence`; anything else → `to-confirm`. The result is a **suggestion** for the reviewer, never final.
10. **Human decision**: see §4.
11. **Ingest**: accepted proposals go through the existing ingest (`AtlasIngestor`, structure-aware chunking, taxonomy `country, jurisdiction, docType, rights`). Runtime state is in MongoDB; the repository manifest files are **not written at runtime** — `scripts/export-manifest.ts` emits a manifest diff to commit through a PR.
12. **Impact analysis** (optional, per setting): calls the existing impact analysis for open incidents of the country.
13. **Readiness refresh**: the UI offers "Re-assess affected sectors"; it creates a normal `readiness` battle test (queue, caps and audit as in `docs/06`). Never automatic by default.

## 4. Validation queue
Screen "Legal watch → Proposals": filter by country, status, rights, source tier. Each card: title, authority, date, source link, **excerpt in context**, rights suggestion with reason, duplicate hints, and actions **Accept / Reject / Edit metadata / Ask for more**. Rules: `operator` may accept `official-text` and `open-licence`; **`to-confirm` and `quotation-only` need `admin`** (QR-02); a rejected URL is remembered for 180 days (configurable). Every decision is an audit record (`world.proposal.accept|reject`, with the reviewer and reason).

## 5. Freshness
Per country: `lastWatchAt`, `lastIngestAt`, pending proposals count, stale documents (older than their expected refresh interval, set per `docType`: laws 12 months, strategies 12, reports 6; configurable). Shown as badges on the sheet and as a map layer ("freshness").

## 6. Security
| Threat | Control |
|---|---|
| SSRF | Guarded fetch (DNS/IP checks, redirects, scheme) |
| Prompt injection via page content | Data-only blocks, no tools for the extractor, strict schema, code-side excerpt verification, injection-pattern log |
| Malicious files | Size/MIME limits, no script execution, parsing isolated in the API process with timeouts |
| Source poisoning | Tier allow-list, human review, rights check, duplicate detection |
| Data leakage in queries | Queries come from templates and registry fields only; never corpus text or incident data |
| Copyright | Store excerpt + hash + link in proposals; ingest only after the rights decision; third-party terms preserved (`docs/LICENSING.md`) |
| Secrets | Keys stay in env/SOPS; never in logs or exports |
| Availability | Timeouts, back-off, per-domain circuit breaker; cost/credit use goes through the same `WorkGate` as other model work |

## 7. Interface
Buttons on the country sheet and in the selection bar: **Check for updates**, **Discover texts**, **Re-assess sectors**; estimate shown first (queries, domains, model calls); progress by step with cancel; history; per-proposal diff against the manifest.

## 8. Offline bundle import (all modes)
A `.zip` with `bundle.json` (documents: file name, title, authority, `docType`, date, source URL, claimed rights, SHA-256) plus the files. Import validates hashes and schema, then creates **proposals** exactly as online discovery would (same rights and review rules). Suited to field work and to onboarding a country in `local` mode.

## 9. Requirements
REQ-W01 no outbound request in `local` mode (automated test with a network stub that fails on any call) · REQ-W02 nothing enters the corpus without a recorded human decision and a rights value · REQ-W03 excerpts verified in code · REQ-W04 search trace stored · REQ-W05 SSRF and injection test suites pass · REQ-W06 `robots.txt`, rate limit, cache honoured · REQ-W07 every decision audited · REQ-W08 freshness visible wherever a figure is shown · REQ-W09 online jobs cancellable at any step with a consistent state.
