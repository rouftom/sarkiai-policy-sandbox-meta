---
name: SarkiAI git and release
description: The SarkiAI branch and release workflow — topic branch, PR to develop, promotion to main, mirror to meta-hackathon, merge-commit strategy, the pre-push guard and the bootstrap bypass. Use whenever you commit, push, open or merge a pull request, promote a release, or prepare the hackathon submission branch.
---

# SarkiAI git and release

## Branch roles

```
feat/*  fix/*  docs/*  chore/*  refactor/*
        │  PR (merge commit)
        ▼
     develop ──────▶ main            (promotion, production)
        │
        └──────────▶ meta-hackathon  (submission mirror)
```

| Branch | Role | Direct push |
| --- | --- | --- |
| `main` | production, deployed | **forbidden** |
| `develop` | integration, default PR base | **forbidden** |
| `meta-hackathon` | hackathon submission mirror | **forbidden** |
| `feat/*`, `fix/*`, `docs/*`, `chore/*`, `refactor/*` | work | allowed |

**Every change goes through a branch and a PR — documentation and skills
included.** No exception for "just a README fix".

## Work PR

```bash
git switch develop && git pull --ff-only
git switch -c feat/<scope>
# ... edit, commit atomically ...
git push -u origin feat/<scope>
gh pr create --base develop --title "<type>(<scope>): <summary>" --body-file <file>
```

- Conventional Commits, imperative, scope required: `feat(api): …`.
- One topic per PR; a PR that mixes refactor and behaviour is split.
- Address review by pushing more commits to the same branch; never force-push a
  branch another person may have based work on.
- Merge with a merge commit — **never squash**, never rebase a shared branch:
  `gh pr merge <n> --merge --delete-branch`.

## Promotion to production

1. `develop` is green: typecheck, tests, build, local probes.
2. PR **`develop` → `main`**, title `release: promote <theme or date>`, body
   listing the merged PRs and the checks.
3. Merge with a merge commit (`gh pr merge <n> --merge`).
4. The API deploys from `main`; the console deploys from the merge commit. Run
   the verification steps in `sps-quality-gates`.
5. Mirror: PR **`develop` → `meta-hackathon`**, merge with a merge commit.

`meta-hackathon` is a mirror, not a fork: it must never receive a change that
`develop` does not have.

## Hotfix

Branch from `main` (`fix/<scope>`), PR into `main`, merge, deploy and verify.
Then back-merge `main` into `develop` with a PR (`main → develop`) and mirror
`develop → meta-hackathon`. `develop` must never drift behind `main`.

## Local guard

```bash
make hooks            # git config core.hooksPath .githooks, idempotent
```

`.githooks/pre-push` refuses a push whose destination is `main`, `develop` or
`meta-hackathon`, deletions included. It is a guard-rail, not the lock: GitHub
branch protection is authoritative (PR required, force-push and deletion
blocked, administrators included). `gh pr merge` happens server-side and is not
blocked by the hook.

**Bootstrap only** — synchronising protected branches before protection is
enabled:

```bash
ALLOW_PROTECTED_BRANCH_PUSH=1 git push origin develop
```

Use it once, in a documented bootstrap, never for feature work.

## After a merge

```bash
git switch develop && git pull --ff-only
git fetch --prune
git branch -d feat/<scope>          # remote branch deleted by --delete-branch
```

## PR body

```md
## What
One paragraph on the behaviour changed.

## Why
The problem or requirement it answers.

## Checks
- `bun run typecheck` — pass
- `bun test apps/api/src` — N pass
- `bun run build` — pass
- manual smoke: <commands and result>

## Notes
Migrations, env vars, rollback, follow-ups.
```

Never paste a secret, a key, a token, a `.env` line or a private host in a PR
body or a commit message.

## Rules that bite

- No history rewrite of `main`, `develop`, `meta-hackathon`: no force-push, no
  filter-branch, no rebase of shared history.
- Do not merge your own PR unless the maintainer asked for it explicitly in
  this session.
- A red check blocks the merge; fix on the branch.
- Do not delete a protected branch, ever.
