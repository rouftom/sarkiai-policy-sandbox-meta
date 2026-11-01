# Contributing

Short version: **read `AGENTS.md`, branch from `develop`, open a PR**.

## Setup

```bash
bun install
cp .env.example .env      # placeholders only
make up && make models    # Docker stack + local models
make hooks                # install the pre-push branch guard
```

Open <http://localhost:3000/setup> to create the root operator. On a local
install without an e-mail key, the one-time password is shown once on the page.

## Workflow

- `main` is production, `develop` is integration, `meta-hackathon` is the
  submission mirror. All three are protected: **no direct push**.
- Create `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>` from
  `develop`, then open a PR into `develop`.
- Documentation and skills follow the same rule.
- Merges are **merge commits** — never squash.
- Promotions are `develop → main`, then `develop → meta-hackathon`.

Full procedure, including the hotfix path and the bootstrap bypass:
[`docs/agent-workflow.md`](docs/agent-workflow.md).

## Checks

```bash
bun run typecheck
bun run test
bun run build              # when apps/web or a published package changes
```

Add the commands you ran and their result to the PR body. A red check blocks
the merge.

## Conventions

- English for code, comments, docs, commits and PRs.
- Conventional Commits with a scope: `feat(api): …`.
- Every user-visible string goes through `apps/web/src/lib/i18n.tsx`, in **both**
  locales.
- Never commit `.env*`, a key, a token or a private host. `.env.example` holds
  placeholders only.

## Where to look

| Need | File |
| --- | --- |
| Repository rules | `docs/RULES.md` |
| Architecture | `docs/ARCHITECTURE.md` |
| Data model | `docs/DATA-MODEL.md` |
| Tests | `docs/TESTING.md` |
| Secrets | `docs/SECRETS.md` |
| Agent playbooks | `.opencode/skills/` |
