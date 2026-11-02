# Cameroon corpus (CM)

The national knowledge base, with **health** as the priority domain. File names
are **normalised** (ASCII, snake_case) so ingestion stays predictable. Payloads
(PDF/TXT) are git-ignored: only `manifest.json` and this README are versioned.

## Documents

| File | Type | OCR? | Content |
|------|------|------|---------|
| `loi_2024_protection_donnees_personnelles.pdf` | law | — | Personal data protection law (23 Dec. 2024) — **core** |
| `plan_strategique_cameroun_numerique_2020.pdf` | strategy | — | Cameroon Digital strategic plan |
| `psnsn_sante_numerique_2026_2030.pdf` | policy | **yes** | National Digital Health Strategic Plan (114 p.) |
| `compact_national_sante_2023.pdf` | policy | **yes** | National health compact / UHC (partly non-Unicode font) |
| `resume_snd30.pdf` | strategy | — | SND30 summary |
| `snd30_complet_2020_2030.pdf` | strategy | — | Full SND30 |
| `cemac_protection_droits_utilisateurs.pdf` | regulation | — | CEMAC directive on users' rights (telecoms) |
| `loi_2010_021_commerce_electronique.pdf` | law | **yes** | Law 2010/021 on electronic commerce (14 p., scanned) |
| `art_observatoire_marche_telecom_2016.pdf` | report | — | ART telecom market observatory, 2016 |
| `loi_2010_012_cybersecurite_cybercriminalite.pdf` | law | — | Cybersecurity / cybercrime law 2010/012 |
| `loi_2013_013_communications_electroniques.pdf` | law | — | Electronic communications law |
| `decret_2023_interconnexion.pdf` | regulation | — | Decree on network interconnection and access (2023) |
| `art_recueil_textes_2018.pdf` | law | — | Compilation of telecom texts (ART, 486 p.) |
| `compendium_textes_poste_telecom_tic_2023.pdf` | law | **yes** | MINPOSTEL compendium 2023 (456 p.) |
| `decret_certification_electronique.pdf` | regulation | **yes** | Decree on electronic certification |
| `normes_standards_sr_pf_sante.pdf` | guidance | **yes** | SR/PF standards (164 p.) |
| `penal_code_2016.pdf` | law | **yes** | Penal code (139 p.) |
| `cameroon_id_cr_ecosystem_diagnostic.txt` | report | — | ID / civil registration diagnostic (docx → txt) |

`manifest.json` is the machine-readable inventory: one entry per document, with
its type, jurisdiction, readiness pillars, status, priority, OCR need and source
URL.

## OCR

Seven PDFs are **scanned without a text layer** (`needsOcr: true`). Ingestion
calls the `ocr` service (Tesseract) automatically when the extracted text is too
short. The large ones (PSNSN 114 p., standards 164 p., penal code 139 p.) take a
while: use the `full`/`ocr` profile, or pre-OCR them offline.

> Ingestion only reads **PDF/TXT**. Convert `.docx`/`.pptx` to `.txt` first
> (e.g. `unzip -p X.docx word/document.xml`, then strip the tags).

## Ingest

```bash
./scripts/seed.sh --country cm --doc-type law      --dir data/country/cm
./scripts/seed.sh --country cm --doc-type strategy --dir data/country/cm
./scripts/seed.sh --country cm --doc-type policy   --dir data/country/cm
./scripts/seed.sh --country cm --doc-type guidance --dir data/country/cm
./scripts/seed.sh --country cm --doc-type report   --dir data/country/cm
```

Or one document at a time through the API, when the `docType` must be exact:

```bash
curl -X POST "$INGESTION/v1/ingest/file" -H "X-API-Key: $SERVICE_API_KEY" \
  -F file=@data/country/cm/loi_2024_protection_donnees_personnelles.pdf \
  -F country=cm -F jurisdiction=national -F docType=law
```

## Sourcing and rights

Documents come from the issuing institutions' public publications: the
Presidency and the National Assembly for laws, MINPOSTEL for digital, telecom
and AI policy, the Ministry of Public Health for health instruments, ART for
telecom regulation, ANTIC for cybersecurity and the data-protection authority
for personal data. Each manifest entry carries its `sourceUrl`; keep the issuing
authority and the original URL with any document added to the corpus.

Payloads (PDF/TXT) are **not versioned**: only this README and `manifest.json`
are committed. Each entry carries a `rights` field:

- `official-text` — laws, decrees, regulations, codes and official compilations,
  generally outside copyright under Cameroonian law;
- `open-licence` — explicit reuse licence (attribution and licence recorded);
- `quotation-only` — press articles, journal articles and research papers
  without a reuse licence: short attributed quotations only, payload not
  published;
- `to-confirm` — rights not established: do not publish the payload.

Rights were checked against the source publications (November 2026):

- `open-licence`: the ID4D diagnostic (World Bank, CC BY 3.0 IGO), the WHO
  cooperation strategy 2025-2029, the two PRIMASYS case studies and the
  COVID-19 primary health care case study (CC BY-NC-SA 3.0 IGO), and the
  Cameroon Health Equity Diagnostic (World Bank, CC BY-NC 3.0 IGO); the exact
  attribution string is in each `rightsNote`.
- `official-text`: the health compact (MINSANTE, July 2023), the national
  quality-of-care strategy 2024-2028 and the health sector strategy 2016-2027
  (MINSANTE/DOSTS), and the ART telecom observatory (2016).
- `quotation-only`: none. The press article on the AI strategy, the health
  system article and the local-authorities paper were removed from the corpus:
  none grants a reuse licence, so neither their payload nor their chunks are
  kept.

Every entry in this manifest is publishable (`official-text` or `open-licence`).
Before publishing any payload, check its rights status, never ingest personal
data, and keep the issuer and the source URL in the manifest. See [`../../../docs/LICENSING.md`](../../../docs/LICENSING.md).
