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
| `meta_hackathon_deadline_alert_v2` | `Deadline alert: {{1}}\n\nThe clock on this item stops at {{2}}. The coordination cell has flagged the outstanding clauses and prepared the review pack.\n\n{{3}}\n\nOpen the console to approve, amend or reject before the deadline.` | URL (static): `https://<WEB_PUBLIC_URL>/` |
| `meta_hackathon_approval_request_v2` | `Approval requested.\n\nA decision from the focal point is needed on the following item:\n\n{{1}}\n\nThe signed link below opens the approval page. It works once and expires on {{2}}. Nothing is published until you decide.` | URL (dynamic): `https://<WEB_PUBLIC_URL>/approve/{{1}}` |

A fourth template, `meta_hackathon_hello_world` (`Hello World`, no variable, no
button), exists only to smoke-test the channel: send it first when the number or
the token changes.

### Review status

Before a demo, read the review status back from the WABA:

```
GET /{WABA}/message_templates?fields=name,status,category,language
```

Only an `APPROVED` template can be sent on the business-initiated path. A
template still `PENDING` is reported as such by `GET /v1/notifications/status`
and refused at send time by Meta; the console never presents it as usable.

The exact sample name `hello_world` cannot be created: Meta reserves it and
answers `400 / code 100 / subcode 2388155` — *"Le nom du modèle est déjà utilisé
comme exemple de modèle"*. Use `meta_hackathon_hello_world` instead.

`WEB_PUBLIC_URL` is the public address of the web app, so the approval button
base is `<web-public-url>/approve/{{1}}`.

The domain changed from the Vercel deployment to the custom console origin. The
existing template buttons still carry the legacy base URL and keep working
because that host stays alive; editing the base URL means submitting the
template again for review (a new version), so it can be done whenever the old
host is retired.

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
deadline_alert    → meta_hackathon_deadline_alert_v2  body: [title, deadline, actionUrl ?? 'Open the console']
approval_request  → meta_hackathon_approval_request_v2  body: [summary, expiresAtISO], button: signed token
```

The console does not use `/v1/whatsapp/notify` directly: it sends through
`/v1/notifications/whatsapp`, which resolves the address book, checks each
recipient's WhatsApp consent, then calls the same templates. Its `kind` values
add `test` → `meta_hackathon_hello_world` (no body variable), the only template
that can be sent before the Utility ones are approved.
See `docs/NOTIFICATIONS.md` for the address book, the audit trail and the
consent model.

`WHATSAPP_TEMPLATE_LANGUAGE` selects the language code sent with every message
(default `en`). `dryRun: true` (or an unconfigured client) returns the rendered
payload and the signed approval URL instead of calling Meta: this is what the
demo uses when no live number is attached.

## Security notes

- The approval token is stateless (`packages/whatsapp/src/approval.ts`): HMAC
  over the claims with `APPROVAL_SECRET`, 24 h TTL by default, single use
  enforced by the `whatsapp_approvals` collection (`_id = jti`).
- The webhook is verified against `X-Hub-Signature-256` computed over the **raw**
  body; Fastify keeps the raw bytes for that reason. Verified on the deployed API:
  handshake echoes `hub.challenge`, a signed POST returns `{ received: true }`,
  a forged signature returns `401`.
- Inbound free text is acknowledged, never interpreted as an approval. A
  decision requires the signed link.
- A single-use decision is also written to the hash-chained audit log as
  `whatsapp.approval`.

## Webhook: intentionally not implemented

The route is implemented and verified (`GET` handshake, `X-Hub-Signature-256`
checked over the raw body, signed `POST` accepted, forged signature `401`), but
Meta does not call it and we decided not to change that for the hackathon.

Reason: inbound messages and delivery statuses require the Meta app that owns
the WABA (the system user token in `WHATSAPP_ACCESS_TOKEN`) to point its
`whatsapp_business_account` callback at `https://<api-host>/v1/whatsapp/webhook`.
That app is shared and already routes its WhatsApp callback to another product.
Repointing it would risk an unrelated integration for a feature the demo does not
need — sending works without receipts.

Accepted consequences:

- a message counts as sent when `POST /{phone-number-id}/messages` answers `200`
  with a `wamid`; no `delivered` / `read` receipt is recorded;
- replies to a template are not ingested (inbound text never decides anything
  anyway: approvals go through the signed link);
- the console shows the provider's answer, not a delivery state.

If statuses ever become necessary, dedicate a Meta app to this product (WhatsApp
product, same WABA, callback `https://<api-host>/v1/whatsapp/webhook`, `messages`
field) and subscribe it with `POST /{WABA}/subscribed_apps` using that app's
token. That is the only safe option: a Meta app has a single WhatsApp callback.

