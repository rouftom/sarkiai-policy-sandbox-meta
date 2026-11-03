# Security policy

## Supported versions

Security fixes land on the integration branch and are promoted to the deployed
branches following the project's workflow:

| Branch | Supported |
| --- | --- |
| `main` (production) | ✅ |
| `develop` (integration) | ✅ |
| `meta-hackathon` (submission mirror) | ✅ (mirrors `develop`) |
| Topic, feature and release branches | ❌ |

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a security
vulnerability.**

Report it privately through GitHub Security Advisories:
<https://github.com/rouftom/sarkiai-policy-sandbox-meta/security/advisories/new>.
If you cannot use that form, open a minimal public issue asking a maintainer for
a private channel, without details of the vulnerability.

Include as much of the following as you can:

- the type of issue (for example authentication bypass, injection, SSRF,
  exposed secret, broken access control);
- the affected component (web console, API, MCP sidecars, deployment);
- the affected version, commit, branch or URL;
- any special configuration required to reproduce it;
- step-by-step reproduction instructions;
- a proof of concept or exploit code, if you have one;
- the impact, including how an attacker might exploit it.

Never include a real credential, token, API key or personal data in a report.
Reference the variable or file name only; if a real secret leaked, say so
immediately so it can be rotated. See [`docs/SECRETS.md`](docs/SECRETS.md).

## What to expect

- We acknowledge the report as soon as possible and keep the discussion private
  until a fix is available.
- We confirm the scope, ask for missing reproduction details, and agree on a
  coordinated disclosure date.
- We credit the reporter in the advisory unless they prefer to stay anonymous.

This project has no bug bounty. Reports are handled on a best-effort basis by
the maintainers.

## Scope

In scope:

- the `apps/web` console and `apps/api` HTTP surface;
- the MCP sidecars under `services/` (`mcp-charts`, `mcp-docx`);
- the packages under `packages/`;
- deployment configuration committed to this repository.

Out of scope:

- vulnerabilities in third-party dependencies with no exploitable path in this
  project (report them upstream as well);
- findings that require a compromised operator account;
- social engineering, physical access and denial-of-service by volume;
- missing hardening headers with no demonstrated impact.

## Security controls

- **Shared state is administrator-only.** Writes to the legal corpus, the country
  registry, the shared address book and outbound WhatsApp or e-mail messages
  require the `admin` role. Every other operator can read and run analyses.
- **Setup and secrets fail closed.** When the configured database is unreachable,
  the setup endpoint does not treat the instance as empty, so a second root
  operator cannot be created during an outage. A cloud deployment on a public
  origin refuses to start without a private session secret.
- **Inbound webhooks are signed.** A cloud deployment rejects WhatsApp webhooks
  when the app secret is not configured, and verifies `x-hub-signature-256`
  otherwise.
- **The browser is hardened.** Model output is sanitized before rendering, a
  Content-Security-Policy restricts `img-src` and `frame-src`, and CORS accepts
  only this project's origins.
- **Credentials.** Passwords are hashed with scrypt; tokens and codes are compared
  in constant time; TOTP codes are single-use; password-reset and approval links
  are signed single-use tokens; authentication and costly routes are rate-limited.
- **Server-side keys stay server-side.** The MCP gateway is only reached from
  authenticated agent runs, and the Meta egress relay requires a shared secret,
  rejects dot segments and only forwards an allowlist of upstream paths.
- **Continuous integration.** Every push and pull request installs from the frozen
  lockfile, runs `bun run typecheck` and `bun test packages apps`; a red check
  blocks the merge.
- **Dependency advisories.** The `audit` job runs `bun audit` on each of the three
  lockfiles: the root workspace, `services/mcp-charts` and `services/mcp-docx`
  (the sidecars sit outside the root workspace). A high or critical advisory
  fails the check. Moderate and low advisories are printed in the log and do not
  block. The job audits lockfiles only, not the built container images.

## Accepted dependency risk

Each entry is dated and reviewed when the related work lands. An advisory is
only ignored with an explicit `--ignore=<GHSA>` in the workflow and an entry here.

| Date | Finding | Severity | Reason and exit |
| --- | --- | --- | --- |
| 2026-11-03 | `deepmerge` 4.3.1, GHSA-gcqx-w48m-w2h4 (prototype poisoning) | low | Reached only through the deprecated `@react-email/components` (`@react-email/render@2.0.6` → `html-to-text@9.0.5`). No upstream fix exists. Removed with the React Email migration below. |
| 2026-11-03 | 21 deprecation notices on `@react-email/*` and `recharts@2.15.4` | deprecated, not a vulnerability | `@react-email/components` and its sub-packages are deprecated at their latest versions. The maintained successor is `react-email` (which bundles the components and re-exports `@react-email/render`, itself maintained). Migrating adds about 60 packages to the API tree, including the React Email CLI toolchain (esbuild, socket.io), so it is a separate decision. `recharts` v3 is an API migration. |

## Known limitations

- Sessions are signed tokens valid for seven days: revoking an account or
  changing a role does not invalidate a token already issued (M1).
- The model preference is saved per operator, but the shared engine applies one
  model at a time, so the last selection drives every operator's runs until
  per-operator routing lands (M2).
- The containers run as root (M7).

## Safe harbour

We will not pursue legal action against researchers who:

- act in good faith and avoid privacy violations, data destruction and service
  disruption;
- only interact with accounts and data they own or have explicit permission to
  use;
- report the issue privately and give us reasonable time to fix it before
  disclosure.

This is a project-level statement, not a legal opinion.
