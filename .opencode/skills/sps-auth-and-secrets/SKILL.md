---
name: SarkiAI auth and secrets
description: The operator lifecycle (first-run setup, one-time password, e-mail confirmation, mandatory TOTP, reset), the optional Resend and Turnstile integrations, the Bearer session model, and the rules for handling secrets and .env files. Use for auth changes, first-connection problems, key handling, or before touching anything that could leak a secret.
---

# SarkiAI auth and secrets

## Operator lifecycle

1. **First visit** to `/setup` creates the root operator; no account is
   pre-created and no password is seeded from the environment.
2. A temporary password is issued:
   - with `AUTH_RESEND_KEY`, it is e-mailed (valid 24 h) and a confirmation link
     is sent;
   - without it, on a **local** instance (`WEB_PUBLIC_URL` unset or a
     localhost/private-network host), `POST /v1/auth/setup` returns `201`
     `{ delivery: "local", password }` **once** and `/setup` shows it with a
     copy button;
   - on a **public** origin it returns `503 { error: "mail_not_configured" }`
     and the account is rolled back (`initialized: false`). The password is
     never displayed there.
3. Until the address is confirmed, sign-in stops at the confirmation step. A
   sign-up in progress survives a reload: the auth pages show the step reached.
4. Then TOTP enrolment is mandatory **before any session exists**.
5. Sign-in = password + TOTP; the temporary password must be changed first
   (`password_change_required`).

Sessions are **Bearer tokens**, never cookies: the API authenticates with the
`Authorization` header, so CORS is not an auth boundary. The console stores the
token through `apps/web/src/lib/session.ts` only. `SESSION_SECRET` signs them
(falls back to `APPROVAL_SECRET`; set it explicitly in production).

## Configuration

| Variable | Effect |
| --- | --- |
| `AUTH_RESEND_KEY` | Resend API key; absent → local one-time password path |
| `AUTH_RESEND_EMAIL_FROM` | From header for setup, reset and invitation mail |
| `AUTH_RESEND_EMAIL_REPLY_TO` | optional Reply-To |
| `AUTH_SIGNUP` | force self-service sign-up on/off; default open in cloud, closed otherwise |
| `AUTH_MAX_OPERATORS` | cap on public accounts (default 12) |
| `SESSION_SECRET` | session signing key (never a default) |
| `APPROVAL_SECRET` | signs WhatsApp approval links; also the session fallback |
| `WEB_PUBLIC_URL` | canonical console origin used in every sent link |

The setup endpoint stays usable only while no operator exists. Never add a
hard-coded fallback credential.

## Turnstile (optional)

- The API owns the feature: `GET /v1/auth/captcha` returns
  `{ required, siteKey }`, and the web build carries no Turnstile variable.
- The site key is read server-side from
  `NEXT_PUBLIC_CLOUDFLARE_TURNSITE_SITE_KEY` (legacy name, API-side only; it is
  not a browser variable). The secret is `TURNSTILE_SECRET`, with
  `CLOUDFLARE_TURNSITE_SITE_SECRET` still accepted.
- Active only in `cloud`/`sovereign` when a key is set; `local` never calls
  Cloudflare. No keys → the check is off and the forms keep working.
- Cloudflare unreachable (timeout, network, 5xx) **never blocks** a request; an
  explicit refusal from siteverify does. Pin `TURNSTILE_HOSTNAMES` in
  production.

## Secrets rules

- Never read, print, commit or transmit `.env`, `.env.local`, `.env.cloud`.
  Only `.env.example` is tracked, with placeholders.
- Never echo a key in a command, a log, a PR body, a screenshot or a chat.
  Reference the variable name only.
- `.env.enc` (SOPS + age) may be committed; the age private key never is
  (`docs/SECRETS.md`).
- Documentation stays generic: no cloud space, hosted project, team slug,
  deployment id, private host or credential. Use `<api-host>` / `<web-host>`.
- Secrets have no usable default. `change-me-*` is local-only and must be
  replaced before any public deployment.
- A new secret → `config.ts` (or the owning module), `.env.example` (empty), the
  deploy doc, and `docs/SECRETS.md` when operational.

## Checks

```bash
bun test apps/api/src
cd apps/api && bun run typecheck
```

Local smoke, both fallback paths:

- no mail key, local origin → `201` with `delivery: "local"` and a password;
- public origin, no mail key → `503 mail_not_configured`, account rolled back.

Then sign in, change the password, enrol TOTP and confirm a protected route
answers `401` without a token.
