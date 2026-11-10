# Migrating operator authentication to better-auth

Status: **phase 2 (route cut-over) implemented and validated against a throw-away
MongoDB database**. The HTTP contract is unchanged: `apps/web/src/lib/auth.tsx`
and `apps/api/src/auth-routes.ts` keep calling the same methods and returning the
same shapes.

`apps/api/src/auth.ts` now selects the backend:

| Condition | Backend |
| --- | --- |
| `MONGODB_URI` is set (`config.mongodb.configured`) | `BetterAuthService` (`@sps/auth/better-auth`) |
| No `MONGODB_URI` | legacy `AuthService` (in-memory) |

The legacy service stays because a bare local install has no Mongo store; it is
not a second production path.

## What better-auth owns, and what stays application-level

better-auth owns the durable side:

- the `user`, `account`, `session`, `verification` and `twoFactor` collections;
- the password hash, kept in the legacy `scrypt$16384$8$1$<salt>$<digest>` format
  through `emailAndPassword.password.hash/verify`, so **nobody has to reset a
  password**;
- seven-day sessions stored in Mongo and read on every request, with cookie cache
  disabled, so a removal or a revoke invalidates at once;
- the TOTP secret and the single-use recovery codes, encrypted with the auth
  secret (`symmetricEncrypt`, `backupCodeOptions.storeBackupCodes: "encrypted"`);
- the reset-link verification record consumed by `auth.api.resetPassword`.

What stays in `BetterAuthService` is the sign-in *state machine*:

- the console and the API are different origins, so there is no
  cookie. The session travels as `Authorization: Bearer <token>`; tokens are
  created with `internalAdapter.createSession` and verified with
  `auth.api.getSession` through the `bearer` plugin.
- the short-lived `challenge` between password and TOTP (or password change) is a
  signed HMAC envelope, exactly the shape the console already expects. The
  `two-factor` plugin's own cookie cannot be relied on cross-origin, so the
  plugin supplies storage and encryption, not the HTTP flow.
  The signature protects **integrity, not confidentiality**, and works whatever
  the topology: two services on different machines or domains only need an HTTPS
  route between them and the same secret on the API. On plain HTTP — including a
  LAN — the challenge and the bearer token travel in clear and can be replayed,
  so TLS or a VPN is required. A same-origin reverse proxy (console and API under
  one domain) would allow first-party `httpOnly` cookies instead of a bearer
  token in `localStorage`; the signed challenge is what makes the split
  console/API deployment work without third-party cookies.
- account provisioning (`internalAdapter.createUser` + `createAccount`) is done
  directly so the service keeps control of the mailed password, e-mail
  verification and rollback when the mail transport fails.
- every direct adapter write runs inside `runWithEndpointContext`, the context
  better-auth installs for its own endpoints: the internal adapter's database
  hooks read it, so a bare call would fail with "No auth context found".
- throttling, replay refusal (`user.totpLastStep`) and the preference merge.

| Guarantee | Legacy `@sps/auth` | Phase 2 |
| --- | --- | --- |
| Session transport | HMAC token in `Authorization` | `bearer` plugin, same header |
| Session lifetime | 7 days | `session.expiresIn = 7 days` |
| Revocation | account re-read on every request, `sessionVersion` bump | `deleteSessions`, session re-read from Mongo |
| Password hash | `scrypt$16384$8$1$<salt>$<digest>` | unchanged, through `emailAndPassword.password.hash/verify` |
| Second factor | TOTP + single-use recovery codes | `twoFactor` collection, encrypted by the same secret |
| Roles | `operator`, `admin` | `admin` plugin with the same two roles |
| Sign-up | e-mail verification before the second factor | `requireEmailVerification`, `sendOnSignUp: false` |
| Password reset | 30 minutes | `resetPasswordTokenExpiresIn: 30 minutes`, sessions revoked |
| Mail | Resend, application owns the templates | application still owns every template |
| Audit | `AuditService`, best-effort | unchanged, called from the routes |

## Route mapping

The console-facing routes are untouched. Internally:

| Route | Phase 2 implementation |
| --- | --- |
| `POST /v1/auth/setup` | `countTotalUsers` guard, then `internalAdapter.createUser` + `createAccount` (admin, mailed password) |
| `POST /v1/auth/signup` | same, `emailVerified: false`, then the application mails a signed verification link |
| `POST /v1/auth/email/verify` | `verifyJWT` on the signed link, then `updateUser({ emailVerified: true })` |
| `POST /v1/auth/reset/request` | `createVerificationValue("reset-password:<token>", userId)` |
| `POST /v1/auth/reset/confirm` | `auth.api.resetPassword` (consumes the record, re-hashes, revokes sessions) |
| `POST /v1/auth/login` | credential lookup + legacy hash verify → HMAC `challenge` |
| `POST /v1/auth/password` | challenge check, `updatePassword`, `mustChangePassword: false`, new challenge |
| `POST /v1/auth/mfa/enroll` | TOTP secret generated in process, bound to the challenge |
| `POST /v1/auth/mfa/confirm` | TOTP check, encrypted `twoFactor` row, `twoFactorEnabled: true`, `createSession` |
| `POST /v1/auth/mfa/verify` | decrypt `twoFactor`, replay guard on `totpLastStep`, `createSession` |
| `POST /v1/auth/logout` | `deleteSessions(userId)` |
| `GET /v1/auth/me` | `getSession`, user row + additional fields |
| `GET/PUT /v1/auth/preferences` | `updateUser({ preferences })` |
| `GET/POST/PATCH/DELETE /v1/auth/operators` | `listUsers` / `internalAdapter.deleteUser` |
| `GET /v1/audit` | unchanged |

The `challenge` envelope (`password_change_required`, `enrollment_required`,
`mfa_required`) is identical to the legacy one, so the login page is untouched.

## Data plan

Legacy `operators` documents (`_id` = lower-cased e-mail) become three
collections:

| Legacy field | better-auth |
| --- | --- |
| `_id`, `email` | `user.email` (+ deterministic id via `legacyUserId`) |
| `name`, `firstName`, `lastName` | `user.name` and the additional fields |
| `role` | `user.role` |
| `passwordHash` | `account.password` (`providerId: "credential"`) |
| `preferences` | `user.preferences` |
| `mustChangePassword` | `user.mustChangePassword` |
| `emailVerificationPending` | `user.emailVerified = false` |
| `totpSecret` | `twoFactor.secret`, encrypted with the auth secret |
| `backupCodes` | `twoFactor.backupCodes`, encrypted JSON array |
| `createdAt`, `lastLoginAt` | `user.createdAt`, `user.lastLoginAt` |

`packages/auth/src/better-auth/migrate.ts` exposes `planOperatorMigration`,
`planTwoFactor` and `migrationWarnings`. The planning functions are pure apart
from encryption, so a dry run can list every warning before anything is
written.

Two deliberate consequences:

- better-auth ids are 32-character hex strings derived from the e-mail, which
  keeps a re-run idempotent. They are not Mongo `ObjectId`s; the adapter keeps
  them as strings.
- Existing HMAC sessions are not imported. Operators sign in once after the
  cut-over; this also clears any token issued before the migration.

## Validation

`packages/auth/src/better-auth/service.integration.test.ts` drives the real
service against MongoDB: root setup, forced password change, TOTP enrolment,
replay refusal on the enrolment code, single-use recovery codes, preferences,
password reset with session revocation, public sign-up and e-mail verification.
It only runs when `MONGO_URL` is set, writes to `SPS_AUTH_TEST_DB` (or a
timestamped `sps_better_auth_test_*` database) and drops that database in
`afterAll`:

```sh
MONGO_URL=mongodb://127.0.0.1:27017 bun test packages/auth
```

Without a throw-away database the suite skips the integration test, so CI stays
green on an install without Mongo.

## Phases

1. **Foundations (done)** — `@sps/auth/better-auth` builds the instance, the
   migration planner exists, tests cover construction, password compatibility,
   TOTP encryption and warnings.
2. **Route cut-over (done, validated)** — `BetterAuthService` implements the
   whole method surface `apps/api/src/auth-routes.ts` calls; `apps/api/src/auth.ts`
   picks it when Mongo is configured. Routes, schemas and the console client are
   unchanged. The integration test above exercises the flows against a throw-away
   database.
3. **Data migration** — a one-shot script reads `operators`, writes
   `user`/`account`/`twoFactor` in that order inside a transaction when the
   deployment supports one, prints the warnings and refuses to overwrite an
   existing `user` with a different password hash.
4. **Cleanup** — remove the legacy `AuthService`, its tests and the HMAC token
   helpers once phase 2 has run in production for a full session lifetime.

## Operational notes

- `BETTER_AUTH_SECRET` should be a private value of at least 32 characters. It
  also encrypts the TOTP secrets and the recovery codes: changing it after the
  migration invalidates every enrolment. When it is unset, the API derives a
  stable 64-character key from `SESSION_SECRET` (SHA-256), so a short legacy
  secret keeps working; rotating that secret still invalidates enrolments.
- `API_PUBLIC_URL` is the public API origin better-auth uses to build links; when
  it is unset the API falls back to `http://localhost:<PORT>`. `trustedOrigins`
  lists the console origins allowed to call the API.
- The existing per-IP Fastify limiter stays in place; better-auth adds its own
  endpoint limits as defence in depth.
- `@better-auth/core` is a direct dependency, pinned to the same version as
  `better-auth`: the service uses its `runWithEndpointContext` so the internal
  adapter's database hooks run exactly as they do for a native endpoint. Both
  are on `1.7.19`, past the rate-limiter and two-factor advisories that blocked
  `1.4.5`.
- `BETTER_AUTH_TRANSACTIONS` (default off) decides whether better-auth runs its
  multi-write operations in a MongoDB transaction. It needs a replica set or a
  mongos; a bare local `mongod`, which the project supports, refuses them, so
  the safe default is off. Turn it on for an Atlas deployment.
- The better-auth HTTP handler is **not** mounted: browser calls still hit the
  Fastify routes. Cookie attributes are configured for the day the handler is
  mounted, not used today.

## Risks

- **TOTP encryption**: legacy secrets are stored in the clear. The migration
  encrypts them with `symmetricEncrypt`; a wrong secret makes every enrolment
  unreadable, so back up the auth secret before running phase 3.
- **Recovery codes**: better-auth stores them encrypted
  (`backupCodeOptions.storeBackupCodes: "encrypted"`), which changes the shape
  of `twoFactor.backupCodes` compared with the plain-JSON default.
- **Session invalidation**: the cut-over signs everyone out. Announce it before a
  demo window.
- **Admin bootstrap**: `POST /v1/auth/setup` must keep its "store is empty"
  guard, otherwise better-auth's sign-up would remain open on a deployed API.
- **Internal adapter**: `BetterAuthService` calls `auth.$context.internalAdapter`,
  which is not part of better-auth's stable public API. `better-auth` and
  `@better-auth/core` are pinned to `1.7.19`; re-read the adapter and context
  surfaces before upgrading. The 1.4 → 1.7 move already required one: the
  internal `deleteSessions` now takes session tokens, so the service calls
  `deleteUserSessions` for the owner-wide sweep.
- **Validation scope**: the integration test uses a throw-away database and
  synthetic accounts. It does not cover a real Resend delivery or a production
  Atlas cluster; phase 3 must still start with a copy.
