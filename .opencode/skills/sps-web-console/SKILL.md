---
name: SarkiAI web console
description: Rules for the Next.js console in apps/web — App Router layout, the bilingual flat i18n map, the API client, auth/session handling, the SarkiAI Compact UI charter and the checks before shipping a screen. Use when editing a page, a component, a translation, the assistant panel or the auth journeys.
---

# SarkiAI web console

## Layout

```
src/app/(app)/...        authenticated shell: dashboard, knowledge, scenarios,
                         readiness, audit, observability, countries, guide, preferences
src/app/login|signup|setup|verify-email|forgot-password|reset-password
src/app/approve/[token]  signed WhatsApp approval, no session
src/lib/api.ts           the only typed API client (ApiError, API_URL)
src/lib/session.ts       token storage + expiry
src/lib/auth.tsx         auth context (session, operator, sign-in/out)
src/lib/i18n.tsx         en + fr flat message map
src/components/ui        primitives shared with the design system
```

## i18n is mandatory

`apps/web/src/lib/i18n.tsx` holds two flat maps. `fr` is typed
`Record<keyof typeof en, string>`, so adding an English key without its French
counterpart fails the typecheck. Rules:

- Add the key to **both** maps in the same commit.
- Keys are namespaced by screen (`setup.passwordCopied`, `readiness.title`).
- Interpolation uses `{name}` placeholders, never string concatenation.
- Never render an object from the API that contains prose; pick the fields.
- English is the default locale; French is the primary field locale.

## Data access

- All calls go through `src/lib/api.ts` (or a `*-client.ts` wrapping it).
- Handle `ApiError` (status + raw body) and the unreachable-network case
  (`failure.ts`) separately: an offline API is not a wrong password.
- Never show a deployment host, a stack trace or a request id in the UI.
- Auth state comes from `src/lib/auth.tsx`; a `(app)` page may assume an
  operator, a public page must not.
- Turnstile is server-driven: `GET /v1/auth/captcha` → `{ required, siteKey }`.
  No `NEXT_PUBLIC_*` Turnstile key exists.

## UI charter (SarkiAI Compact)

- Tokens in `packages/ui/src/styles/tokens.css`, mapped with `@theme inline`;
  never a raw hex where a token exists.
- Multi-theme via `html[data-theme-pack]`, dark via `.dark`; chrome-themed
  pre-paint in `src/lib/chrome-theme.ts`.
- Compact density: inputs `h-7`, buttons `h-8`, labels
  `text-[10px] font-black tracking-widest` (no uppercase).
- Premium surfaces: `backdrop-blur-sm`, `rounded-xl`, identical light/dark
  border parity.
- Z-index: assistant backdrop `z-[105]`, panel `z-[110]`, popovers `z-[130]`,
  dialogs `z-[150]`.
- Reuse `src/components/ui` before writing a new primitive.

## Security

Only `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DEFAULT_LOCALE`,
`NEXT_PUBLIC_WEB_URL` and `NEXT_PUBLIC_WEB_ORIGINS` reach the browser. Provider
keys, Turnstile secret, Mongo URI and `APPROVAL_SECRET` stay server-side. Never
`fetch` a provider from the browser.

## Checks

```bash
cd apps/web && bun run typecheck
bun run build                       # or: bunx turbo run build --filter=@sps/web
```

Open the changed screen in **both locales** and both themes. A new page needs a
link in the navigation or a documented deep link; an orphan route is a bug.
