# Licensing

The project mixes **code** and **content**, which are best licensed separately.

## Code: Apache-2.0 (default)

All source code (apps, packages, services, scripts) is under **Apache-2.0**
(see [`LICENSE`](../LICENSE)).

Why Apache-2.0 rather than MIT / AGPL:

| License | Patent grant | Copyleft | Fit |
|---------|:------------:|:--------:|-----|
| **Apache-2.0** | ✅ explicit | no | **Recommended**: permissive, patent protection, standards/enterprise-friendly (a public tool for regulators/reference) |
| MIT | ❌ | no | simpler but no patent grant: weaker for an AI/agents project |
| AGPL-3.0 | ✅ | **network copyleft** | forces anyone hosting it to open-source → discourages government adoption |

**Recommendation: keep Apache-2.0.** The OSI-approved, patent-granting license
suits a project meant to be reused by public institutions and published in the
public sandbox.

## Content / knowledge base: CC BY 4.0

Manifests, curated documentation and any original corpus material contributed by
us are best released under **Creative Commons Attribution 4.0 (CC BY 4.0)** so
the knowledge base can be published and reused with attribution.

**Important:** the *source documents* (national laws, strategies, regulations)
**retain their own terms**; we only redistribute documents that are public and
redistributable, and we record provenance in each `manifest.json`
(`authority`, `sourceUrl`). Do not relicense third-party documents.

## Provenance

Parts of this codebase were **adapted** from the internal *SarkiAI Enterprise*
monorepo (proprietary, © Djotta, all rights reserved). No proprietary or
unpublished module: notably the AgenticUI harness: is included here. The
project is designed to be publishable and standalone.

## Attribution

Made with ♥️ by **Djotta**: https://djotta.com
