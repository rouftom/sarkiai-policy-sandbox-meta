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
- the affected component (web console, API, ingestion service, deployment);
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
- the `services/ingestion` service;
- the packages under `packages/`;
- deployment configuration committed to this repository.

Out of scope:

- vulnerabilities in third-party dependencies with no exploitable path in this
  project (report them upstream as well);
- findings that require a compromised operator account;
- social engineering, physical access and denial-of-service by volume;
- missing hardening headers with no demonstrated impact.

## Safe harbour

We will not pursue legal action against researchers who:

- act in good faith and avoid privacy violations, data destruction and service
  disruption;
- only interact with accounts and data they own or have explicit permission to
  use;
- report the issue privately and give us reasonable time to fix it before
  disclosure.

This is a project-level statement, not a legal opinion.
