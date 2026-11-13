# United States corpus (US)

Federal corpus for the second country in the registry. The four sectors covered
here are **health**, **education**, **telecom** and **agriculture**, plus the
cross-cutting AI policy layer that applies to all of them. File names are
**normalised** (ASCII, snake_case) so ingestion stays predictable. Payloads
(PDF/TXT) are git-ignored: only `manifest.json` and this README are versioned.

## Documents

| File | Type | Sector / layer | Content |
|------|------|----------------|---------|
| `omb_m-24-10_ai_governance_2024.pdf` | guidance | cross-cutting, **core** | OMB M-24-10: agency AI governance and risk management |
| `nist_ai_rmf_1_0_2023.pdf` | standard | cross-cutting, **core** | NIST AI RMF 1.0 (NIST AI 100-1) |
| `nist_ai_600_1_genai_profile_2024.pdf` | guidance | cross-cutting | Generative-AI risk profile (NIST AI 600-1) |
| `nist_csf_2_0_2024.pdf` | standard | cross-cutting | NIST Cybersecurity Framework 2.0 (CSWP 29) |
| `ostp_ai_bill_of_rights_2022.pdf` | policy | cross-cutting | OSTP Blueprint for an AI Bill of Rights |
| `netp_2024.pdf` | strategy | education | 2024 National Educational Technology Plan |
| `hhs_ai_strategy_2025.pdf` | strategy | **health**, core | HHS Artificial Intelligence Strategy |
| `ntia_national_spectrum_strategy_2023.pdf` | strategy | telecom | National Spectrum Strategy (NTIA) |
| `usda_ai_strategy_2025.pdf` | strategy | agriculture | USDA FY 2025–2026 AI Strategy |
| `usda_ai_compliance_plan_2025.pdf` | report | agriculture | USDA AI Compliance Plan, FY 2025–2026 |

`manifest.json` is the machine-readable inventory: one entry per document, with
its type, jurisdiction, readiness pillars, status, priority and source URL.

## Rights

United States federal works prepared by federal employees in the course of their
duties are **not subject to copyright in the United States** (17 U.S.C. §105).
Every entry is therefore `official-text`, which the seeding script treats as
publishable: the full text may enter the knowledge base and be quoted.

This is a US-law reading. It does not settle reuse in other jurisdictions, and
it does not cover third-party material reproduced inside a federal report —
none of the documents here reproduce such material at a scale that matters for
retrieval, but a future addition must be checked before it is marked
`official-text`. See `docs/LICENSING.md`.

## Sourcing

Some agencies refuse automated downloads (HTTP 403) or serve a broken PDF from
their own domain. Where that happened, the payload was fetched from an official
mirror — GPO `govinfo.gov`, ERIC for the Department of Education, the USDA CDN —
and the canonical URL is still the one recorded in `manifest.json`. A mirror
only changes where the bytes came from; the document is the same official text.

The FCC National Broadband Plan (2010) and the FCC AI compliance plan were
dropped: the first serves a truncated PDF with no xref table, the second is an
HTML error page. Telecom is covered by the NTIA spectrum strategy, which is the
current federal telecom plan.

## Ingestion

```sh
# Extract only, no API call:
bun run kb:seed -- --dir data/country/us --country us --dry-run

# Against an API (needs an admin session token):
SPS_ADMIN_TOKEN=… SPS_API_URL=… bun run kb:seed -- --dir data/country/us --country us
```

Every payload here has a text layer, so `needsOcr` is absent throughout and the
Gazette screen is not required. Re-running is idempotent: chunks are keyed by a
content hash and unchanged ones are skipped.
