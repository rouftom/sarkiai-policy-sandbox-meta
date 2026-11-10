# Roadmap

Where SarkiAI Policy Sandbox goes after the hackathon. Everything below is
**planned, not built**, except the short **Built already** notes under a
milestone: those capabilities landed during the hackathon and are listed here so
the roadmap matches the code. What exists today is described in the
[README](README.md), and what was built during the event is listed in
[`HACKATHON.md`](HACKATHON.md). Completed sprints are in
[`docs/SPRINTS.md`](docs/SPRINTS.md).

Horizons are indicative and follow the milestones' dependencies. Every model the
system calls stays a Meta model.

## Horizons

| Horizon | Milestones | Goal |
|---|---|---|
| 0 to 3 months | M1, M2, M3, M5 | Ready for a real institution: identity, roles, notification channels, measured search quality |
| 3 to 6 months | M4, M7, M10 | Living legal corpus, on-premise package, first institutional pilot |
| 6 to 12 months | M6, M8, M9 | Second country, integrations, compliance evidence |

## Milestones

### M1 · Identity and access

- Authentication aligned on [better-auth](https://www.better-auth.com/): passkeys
  alongside the shipped password, TOTP and revocable-session flows.
- Organizations: one per institution, with its own members and invitations.
- Single sign-on (OIDC, SAML) for administrations that run their own directory.

**Built already:** revocable sessions — signing out or changing a password
invalidates every issued token at once (`packages/auth/src/index.ts`,
`POST /v1/auth/logout`).

**Done when** a revoked account loses access at once, and an institution signs in
with its own directory.

### M2 · Roles and permissions (RBAC)

- Roles: administrator, institution focal point, analyst, observer, auditor.
- Incidents, reports and exercises scoped to the institutions involved.
- Every permission change recorded in the audit chain.

**Built already:** model choice per operator (`PUT /v1/models/selection`, audit
event `model.selected`).

**Done when** every action is checked against a role and traced in the audit chain.

### M3 · Notification channels

- An SMS provider next to WhatsApp and e-mail, for focal points without WhatsApp.
- Delivery receipts on every channel, multilingual message templates, automatic
  fallback from one channel to the next.

**Done when** a focal point without WhatsApp receives the request by SMS and the
receipt lands in the audit chain.

### M4 · Automated legal watch

- Collection of official gazettes and ministry publications, with a rights check
  before anything enters the corpus.
- Detection of new and amended texts, a human validation queue, consolidated
  versions with their effective dates.
- Impact analysis triggered automatically on every validated text.

**Done when** a newly published decree is proposed, validated, indexed, and the
affected incidents are flagged without manual work.

### M5 · Agentic search quality

- A legal evaluation set: questions with the provisions that answer them.
- Citation precision, recall, latency and cost tracked per depth and per model.

**Done when** a dashboard reports citation precision for every release.

### M6 · A second country

- A jurisdiction onboarding kit: corpus manifest, institutions and mandates,
  readiness dimensions.
- A second country in Central or West Africa.
- Public communication drafts in Fulfulde and Hausa, always reviewed by native
  speakers.

**Done when** a full crisis simulation runs on another country's law.

### M7 · Sovereign package

- An installable on-premise image: Muse Glimmer, MongoDB, object storage.
- Hardened containers: internal ports only.
- Backups, tested restores and a documented disaster recovery plan.

**Built already:** non-root production containers — the API, web and both MCP
images run as `app` or `node` (`USER` in the four `Dockerfile`s).

**Done when** an institution installs the system offline in a day and restores it
from a backup.

### M8 · Integrations

- Ready-made API collections for the published OpenAPI document.
- Webhooks for national CERTs and regulators.
- Exports of joint reports and incident files, signed decisions.
- A documentation site built from the existing Markdown.

**Built already:** the OpenAPI document generated from the API's validation
schemas (`GET /openapi.json`) and its interactive Scalar reference (`GET /docs/`).

**Done when** a CERT receives the joint report of an incident automatically.

### M9 · Compliance and trust

- A data protection impact assessment under Cameroon's personal data protection
  law of 23 December 2024.
- Retention policy, external penetration test, public security documentation.

**Done when** the penetration test report is addressed and the impact assessment
is published.

### M10 · Institutional pilot

- A real crisis exercise with a partner institution.
- Reaction times measured against legal deadlines, findings fed back into the
  product.

**Done when** a first exercise has run with public officials and its lessons are
published.

### M11 · Agents & AI registry

- Roles built from fixed capabilities, institutions with their legal basis,
  agents combining both with a Meta model: created, versioned and audited by
  administrators, with guarantees no setting can lift.
- Agents chosen in the work screens: crisis scenarios, assistant, exercise.
- Next: the information scope applied by the scenario engine, a test set per
  agent before activation, agent names in observability.

**Status**: first version built after the hackathon (local, not yet released).
See [`docs/AGENTS-AND-ROLES.md`](docs/AGENTS-AND-ROLES.md).

## How to contribute

Pick a milestone, open an issue to discuss the approach, then follow
[`CONTRIBUTING.md`](CONTRIBUTING.md).
