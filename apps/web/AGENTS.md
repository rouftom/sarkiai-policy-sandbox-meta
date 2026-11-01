# `apps/web` — console rules

Next.js 16 App Router, React 19, Tailwind v4, bilingual (EN default, FR).

## Structure

| Path | Role |
| --- | --- |
| `src/app/(app)/` | authenticated console shell (dashboard, knowledge, scenarios, readiness, audit, guide, …) |
| `src/app/login`, `signup`, `setup`, `verify-email`, `forgot-password`, `reset-password` | public auth journeys |
| `src/app/approve/[token]` | signed WhatsApp approval page, no session |
| `src/lib/api.ts` | the only typed API client; `ApiError`, `API_URL` |
| `src/lib/session.ts` | operator token storage and expiry |
| `src/lib/auth.tsx` | auth context: session, operator, sign-in/out |
| `src/lib/i18n.tsx` | flat message map, `en` + `fr` |
| `src/components/` | `ui/` primitives, `layout/`, `auth/`, `workflow/`, `ai/` |

## Hard rules

- **Every user-visible string is a key** in `src/lib/i18n.tsx`. Add the key to
  `en` **and** `fr` in the same commit: `fr` is typed
  `Record<keyof typeof en, string>`, so a missed key fails the typecheck.
  Never render a localised object directly.
- **No server secret reaches the client.** Only `NEXT_PUBLIC_API_URL`,
  `NEXT_PUBLIC_DEFAULT_LOCALE`, `NEXT_PUBLIC_WEB_URL` and
  `NEXT_PUBLIC_WEB_ORIGINS` are browser-visible. Provider keys, Turnstile secret
  and Mongo URI stay in the API.
- **All HTTP goes through `src/lib/api.ts`** (or a `*-client.ts` that wraps it).
  Do not fetch the API from a component. Surface failures with `ApiError` /
  the `failure.ts` helpers; never show a raw host or stack trace.
- **Auth state comes from `src/lib/auth.tsx`**. A page under `(app)` assumes an
  operator; public pages must not. Never store a token in `localStorage` outside
  `session.ts`.
- **Turnstile is server-driven**: ask `GET /v1/auth/captcha` for
  `{ required, siteKey }`. The web build needs no Turnstile variable; the API
  owns the site key and the secret.
- **UI charter** (`docs/RULES.md`): tokens from
  `packages/ui/src/styles/tokens.css`, mapped with `@theme inline`; compact
  density (`h-7` inputs, `h-8` buttons, `text-[10px] font-black tracking-widest`
  labels); `backdrop-blur-sm`, `rounded-xl`, identical light/dark borders;
  assistant backdrop `z-[105]`, panel `z-[110]`, popovers `z-[130]`, dialogs
  `z-[150]`.
- Prefer the existing primitives in `src/components/ui` and the shared
  components before creating one. A new component gets a short header comment.

## Tests and checks

- `cd apps/web && bun run typecheck`
- `bun run build` from the root (or `--filter=@sps/web`) — required when routes,
  metadata or env handling change.
- Unit tests live beside the code (`*.test.ts`), no DOM library by default.
- Verify a changed screen in both locales and both themes before opening a PR.
