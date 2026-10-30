# Operator notifications (e-mail + WhatsApp)

The Communications page reaches the people who must act, over e-mail or
WhatsApp, with a per-channel consent and an audit record for every send.

## Two channels, one address book

A **contact** is a person the coordination cell can reach: a name, an optional
e-mail address, an optional phone number, and one consent flag per channel.

| Channel | Provider | Template |
|---|---|---|
| E-mail | Resend (`AUTH_RESEND_KEY`, `AUTH_RESEND_EMAIL_FROM`) | React Email `NotificationEmail` (`packages/notifications/src/email.tsx`) |
| WhatsApp | WhatsApp Cloud API (`packages/whatsapp`) | approved `meta_hackathon_*` template |

Both are **business-initiated** messages, so both obey the same rule: nothing is
sent to a person who has not consented to that channel. The recipient picker of
the console is filtered by the consent flag — there is no "send to everyone"
shortcut, and the API re-checks the flag for every recipient.

Phone numbers are stored in **E.164 only** (`+237612345678`), validated with
`libphonenumber-js` in the browser (`apps/web/src/lib/phone.ts`) and on the
server (`packages/notifications/src/phone.ts`). A number is rejected rather than
guessed: the operator picks the country, the parser completes the national form,
and anything that does not parse as a valid number never reaches the address
book. Adding an existing number or address again answers `409 duplicate` — it is
a mistake, not a second contact.

The address book is **shared between operators**: a focal point belongs to an
institution, not to one operator's private list. `createdBy` records who added
the row.

Collection: `notification_contacts` (Mongo when reachable, in-memory otherwise,
like every other store in `apps/api`).

## Sending

| Endpoint | Purpose |
|---|---|
| `GET /v1/notifications/status` | whether Resend and WhatsApp are configured, the sending address, and the review status of every `meta_hackathon_*` template (cached 60 s) |
| `GET /v1/notifications/contacts` | the address book |
| `POST /v1/notifications/contacts` | add a contact (validates the number, records consent) |
| `PUT /v1/notifications/contacts/:id` | edit a contact in place (name, addresses, consent) |
| `DELETE /v1/notifications/contacts/:id` | remove a contact; past sends stay in the audit trail |
| `POST /v1/notifications/summary-suggestion` | draft a run-grounded summary for the WhatsApp composer (the operator edits it) |
| `POST /v1/notifications/whatsapp` | send one approved template to a list of contacts |
| `POST /v1/notifications/email` | send the React Email notification to a list of contacts |

Both send endpoints answer with three buckets: `sent`, `failed` (with the
provider's reason) and `skipped` (with a machine reason: `no_phone`,
`no_whatsapp_consent`, `no_email`, `no_email_consent`). A skip is not a failure:
the recipient simply was not eligible.

E-mail is sent **one recipient per call**, never in `Bcc`: no recipient learns
who else was notified.

WhatsApp kinds map to templates exactly as in
`deploy/whatsapp/templates.md`. `test` uses `meta_hackathon_hello_world`, the
only template that needs no variable — useful to prove that the channel works
before the Utility templates are approved.

The composer's feather button (`POST /v1/notifications/summary-suggestion`) asks
the model to summarise the selected run's latest joint report. The prompt carries
only stored facts (title, progress, summary, agreements, conflicts, open
questions) and is written in the interface language; the operator still edits the
text before sending.

## Audit

Every add, edit, removal and successful send is written to the hash-chained audit log:

| Action | Target |
|---|---|
| `notification.contact_added` | `name · email+whatsapp` |
| `notification.contact_updated` | `name · email+whatsapp` |
| `notification.contact_removed` | contact id |
| `notification.whatsapp_sent` | `name · masked phone · template` (+ `runId` when given) |
| `notification.email_sent` | `name · masked address · subject` |

Addresses are **masked** in the target (`maskPhone`, `maskEmail`): the journal
proves who was notified and when, without storing the number in clear in a
second place. The full address stays in `notification_contacts` only, where
removing the contact removes it.

A failure is deliberately not audited as a send: nothing left the building. The
console shows it in the result list, and the operator can retry.

## Consent in real use: the public portal

In this hackathon build the operator records the consent when adding a contact,
which is enough to demonstrate the flow. In a real deployment that is not
acceptable: an operator typing a number is not the person consenting to receive
messages.

The intended production flow is a small public registration portal:

1. The contact receives (or is given) a link to `/consent/<token>` — a signed,
   single-use link, not an open form.
2. The page states which organisation sends what, on which channel, and how to
   opt out; the person selects the channels explicitly. Both boxes start
   unchecked.
3. `POST /v1/notifications/consent` stores the contact with
   `consentSource: 'portal'`, the timestamp and the IP/user-agent hash, then
   sends a confirmation message. Nothing can be sent before that confirmation
   (double opt-in), which is also what WhatsApp expects for a marketing or
   utility list.
4. Every notification carries an opt-out line; `GET /v1/notifications/consent/:token`
   lets the person change or withdraw a channel without calling the cell.
5. `createdBy` becomes `portal:<contactId>` rather than an operator's address, so
   the audit trail distinguishes a self-registered contact from one added by a
   focal point.

Until that portal exists, the console's add dialog is the only entry point, and
the consent checkboxes are the operator's assertion that the person agreed.

## Webhook: intentionally not implemented

Inbound messages and delivery statuses require the Meta app that owns the WABA to
call `https://<api-host>/v1/whatsapp/webhook`. In this deployment the shared Meta
app already routes its `whatsapp_callback` to another product, so delivery
receipts never reach this API.

We deliberately did not work around it: sending is what the demo needs, and
rewiring a shared app for a status webhook would risk breaking an unrelated
production integration for no user-visible benefit here. The route itself is
implemented and verified (signature check, GET handshake, POST ingestion); it is
simply not wired to Meta. Consequences, accepted:

- no `delivered` / `read` receipt: a message counts as sent when Meta returns
  `200` and a `wamid`;
- replies to a template are not ingested;
- approvals stay on the signed link, which does not depend on the webhook.

`deploy/whatsapp/templates.md` keeps the exact procedure for dedicating a Meta
app to this product if statuses ever become necessary.

## Configuration

| Variable | Where | Used for |
|---|---|---|
| `AUTH_RESEND_KEY` | API | Resend API key |
| `AUTH_RESEND_EMAIL_FROM` | API | From: address of every notification |
| `AUTH_RESEND_EMAIL_REPLY_TO` | API | optional Reply-To |
| `WHATSAPP_PHONE_NUMBER_ID` | API | sending number |
| `WHATSAPP_ACCESS_TOKEN` | API | Cloud API token |
| `WHATSAPP_WABA` | API | reads template review status |
| `WHATSAPP_TEMPLATE_LANGUAGE` | API | language code sent with each template (default `en`) |
| `APPROVAL_SECRET` | API | signs the approval link of `approval_request` |
| `WEB_PUBLIC_URL` | API | canonical console origin for links (approval, e-mail); `localhost` when unset |
| `WEB_PUBLIC_URL_ALIASES` | API | extra accepted origins, comma-separated (previous domain, staging host) |
| `WEB_ALLOW_ANY_ORIGIN` | API | `true` accepts every browser origin (unusual proxy setups) |
| `WEB_DEV_PORT` | API | port used by the localhost fallback origin (default `3000`) |

The web app holds **no** provider secret: it only calls the API. The status
endpoint is what tells the console whether a channel can be used, so a missing
key is shown as "not configured" instead of failing at send time.

## Checks

```bash
bun run typecheck
bun test                     # includes packages/notifications (phone + e-mail render)
bun test packages/notifications
```
