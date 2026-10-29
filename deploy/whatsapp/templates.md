# WhatsApp templates: `meta_hackathon_*`

The API calls the WhatsApp Cloud API directly (`packages/whatsapp`); no
notification gateway sits in between. Business-initiated messages must use
**approved utility templates**, so the three templates below have to exist in the
WABA before the demo. Their names are prefixed `meta_hackathon_` to keep them
separate from any other template already in the account.

All three are category **Utility**, language **en** (add a French translation in
the same template if the focal points read French). Body variables are positional:
`{{1}}`, `{{2}}`, …

| Template | Body | Button |
|---|---|---|
| `meta_hackathon_joint_report` | `Joint report for run {{1}}, crisis tick {{2}}.\n\nThe coordination cell cross-checked every claim against the retrieved policy corpus and published this summary:\n\n{{3}}\n\nOpen the console to review the citations before the next tick.` | None |
| `meta_hackathon_deadline_alert` | `Deadline alert: {{1}}\n\nThe clock on this item stops at {{2}}. The coordination cell has flagged the outstanding clauses and prepared the review pack.\n\n{{3}}\n\nOpen the console to approve, amend or reject before the deadline.` | URL (static): `https://<WEB_PUBLIC_URL>/` |
| `meta_hackathon_approval_request` | `Approval requested.\n\nA decision from the focal point is needed on the following item:\n\n{{1}}\n\nThe signed link below opens the approval page. It works once and expires on {{2}}. Nothing is published until you decide.` | URL (dynamic): `https://<WEB_PUBLIC_URL>/approve/{{1}}` |

### Current status (27 Oct 2026)

Created through `POST /{WABA}/message_templates` (`v26.0`), category `UTILITY`,
language `en`. All three were **APPROVED** by Meta on 27 October 2026 (read back
with `GET /{WABA}/message_templates?fields=name,status`):

| Template | ID | Status |
|---|---|---|
| `meta_hackathon_joint_report` | `1389658312947485` | APPROVED |
| `meta_hackathon_deadline_alert` | `1106780912229163` | APPROVED |
| `meta_hackathon_approval_request` | `1682829429905161` | APPROVED |

`WEB_PUBLIC_URL` is the public address of the web app, so the approval button
base is `<web-public-url>/approve/{{1}}`.

The bodies above are longer than the first draft on purpose: Meta rejects a
template whose variable-to-word ratio is too high (`error_subcode 2388293`,
*"Ce modèle comporte trop de variables par rapport à sa longueur"*). Keep at
least a full sentence of static text per variable when editing them: the
runtime contract is unaffected, `bodyParams` stays positional.

## Creating them

1. Meta Business Suite → **WhatsApp Manager → Message templates → Create template**.
2. Category **Utility**, name exactly as above (the prefix is part of the name).
3. Paste the body; keep the variable order: `packages/whatsapp/src/client.ts`
   sends `bodyParams` positionally.
4. For the approval template, add a **Call-to-action → URL** button. Base URL:
   `https://<your-public-host>/approve/`; enable **dynamic URL suffix** so the
   signed token is appended by the API (`buttonUrlParam`). The base URL must
   match `WEB_PUBLIC_URL` and be a public HTTPS host reachable by the judges.
5. Submit; approval is usually minutes for Utility templates.

## Runtime contract

```ts
// apps/api/src/routes/index.ts: /v1/whatsapp/notify
joint_report      → meta_hackathon_joint_report      body: [runId, tick, summary]
deadline_alert    → meta_hackathon_deadline_alert    body: [title, deadline, actionUrl ?? 'Open the console']
approval_request  → meta_hackathon_approval_request  body: [summary, expiresAtISO], button: signed token
```

`WHATSAPP_TEMPLATE_LANGUAGE` selects the language code sent with every message
(default `en`). `dryRun: true` (or an unconfigured client) returns the rendered
payload and the signed approval URL instead of calling Meta: this is what the
demo uses when no live number is attached.

## Security notes

- The approval token is stateless (`packages/whatsapp/src/approval.ts`): HMAC
  over the claims with `APPROVAL_SECRET`, 24 h TTL by default, single use
  enforced by the `whatsapp_approvals` collection (`_id = jti`).
- The webhook is verified against `X-Hub-Signature-256` computed over the **raw**
  body; Fastify keeps the raw bytes for that reason.
- Inbound free text is acknowledged, never interpreted as an approval. A
  decision requires the signed link.
- A single-use decision is also written to the hash-chained audit log as
  `whatsapp.approval`.
