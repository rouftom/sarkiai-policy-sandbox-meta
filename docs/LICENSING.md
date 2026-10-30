# Licensing and corpus rights

The project mixes **code**, **project-authored content** and **third-party
documents**. They are licensed and handled separately.

## 1. Code: Apache-2.0

All source code (apps, packages, services, scripts) is under **Apache-2.0**
(see [`LICENSE`](../LICENSE)).

Why Apache-2.0 rather than MIT / AGPL:

| License | Patent grant | Copyleft | Fit |
|---------|:------------:|:--------:|-----|
| **Apache-2.0** | ✅ explicit | no | **Recommended**: permissive, patent protection, standards/enterprise-friendly (a public tool for regulators/reference) |
| MIT | ❌ | no | simpler but no patent grant: weaker for an AI/agents project |
| AGPL-3.0 | ✅ | **network copyleft** | forces anyone hosting it to open-source → discourages government adoption |

**Recommendation: keep Apache-2.0.** The OSI-approved, patent-granting license
suits a project meant to be reused by public institutions.

## 2. Project-authored content: CC BY 4.0

Documentation, the document manifests (selection, ordering, annotations),
diagrams and our own screenshots are released under **Creative Commons
Attribution 4.0 (CC BY 4.0)** (see [`LICENSE-CONTENT`](../LICENSE-CONTENT)).

This covers **only material we wrote**. It does not cover, and must not be read
as relicensing, any third-party document.

## 3. Third-party documents: access is not a license

A document being publicly accessible does **not** mean it may be redistributed
or relicensed. We do not claim any rights over the source documents and we do
not relicense them.

Each manifest entry carries a `rights` field:

| `rights` | Meaning | What ships |
|----------|---------|------------|
| `official-text` | Official text of a legislative, administrative or judicial nature (law, decree, order, regulation, code, treaty, ministerial strategy or standard) | Manifest + short attributed quotations. Payload stays out of git. |
| `open-licence` | Published under an explicit reuse licence (e.g. CC BY, CC BY-SA, CC BY-NC-SA, CC BY-IGO) | Manifest, attribution and licence notice. Payload stays out of git. |
| `quotation-only` | Third-party authored work with no reuse licence (press article, journal article, research paper, some regulator reports) | Manifest + short attributed quotations only. No full-text redistribution, no public payload. |
| `to-confirm` | Rights not established yet | Manifest only; do not publish or ingest publicly until checked. |

### Why official texts are different

Under Cameroonian law, official texts of a legislative, administrative or
judicial nature are generally excluded from copyright protection (Law
No. 2000/011 on copyright and neighbouring rights). Laws, decrees, orders,
regulations, codes and official compilations therefore fall outside the
`quotation-only` bucket: they may be ingested and cited, with the issuing
authority and the source URL recorded.

Two caveats:

- A compilation or a report may add editorial material (commentary, layout,
  translations) that is protected even when the underlying texts are not. Check
  before treating the whole file as an official text.
- A government document produced with an international partner may carry that
  partner's licence (for example a World Bank report published under CC BY 3.0
  IGO). The partner's terms then apply.

This is the project's documented position, not a legal opinion. When a document
is central to a public deployment, confirm its status with the issuer or with
counsel.

### What the repository actually does

- **Payloads are not versioned.** Third-party PDF/TXT files are git-ignored;
  only the manifests, `README.md`, `dimensions.json` and our own illustrative
  samples in `data/samples/` are committed. The public repository therefore
  distributes metadata, not the source documents.
- **Provenance is recorded.** Each entry has the issuer (`authority`), the
  original URL (`sourceUrl`) and a `rights` status.
- **The demo cites, it does not republish.** Screens show short excerpts with
  the filename, article and heading path, plus a link to the source.
- **No personal data.** The corpus is regulatory and public; no nominal record,
  patient file or private correspondence is ingested.

## 4. Decision rule before adding a document

1. Prefer the **issuer's own publication** over a third-party copy.
2. Decide the bucket: `official-text`, `open-licence`, `quotation-only` or
   `to-confirm`.
3. Record `authority`, `sourceUrl`, `rights` and, for `open-licence`, the exact
   licence and attribution string.
4. If the bucket is `quotation-only`: do not publish the payload, quote short
   passages with attribution, and keep the full text out of the public demo.
5. If the bucket is `to-confirm`: do not ingest it into a public instance until
   the issuer answers.
6. Never relicense a third-party document under CC BY 4.0.

For a public deployment, the safe corpus is the set of `official-text` and
`open-licence` entries. `quotation-only` documents can still inform an internal
analysis, but they should not be served as a searchable full text.

## 5. Takedown

If you hold rights in a document listed here and want it removed, open an issue
in the public repository: <https://github.com/rouftom/sarkiai-policy-sandbox-meta/issues>.
The manifest entry is removed first; no payload is stored in git.

## 6. Provenance of the code

Parts of this codebase were **adapted** from the internal *SarkiAI Enterprise*
monorepo (proprietary, © Djotta, all rights reserved). No proprietary or
unpublished module — notably the AgenticUI harness — is included here. The
project is designed to be publishable and standalone.

## 7. Attribution

Made with ♥️ by **Djotta**: https://djotta.com
