# Git workflow

How changes reach `main` and the hackathon mirror. This applies to **every**
change, including documentation, skills, and configuration.

## Branches

| Branch | Role | Direct pushes |
| --- | --- | --- |
| `main` | production; what is deployed | forbidden |
| `develop` | integration; default base for work PRs | forbidden |
| `meta-hackathon` | hackathon submission mirror of `develop` | forbidden |
| `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`, `refactor/<slug>` | day-to-day work | allowed |

```
feat/* fix/* docs/* chore/* refactor/*
        │  PR (merge commit)
        ▼
     develop ─────▶ main            promotion
        │
        └──────────▶ meta-hackathon mirror
```

`main` and `develop` must never diverge in content: production is always a
promotion of the integration branch, never a parallel line of work.

## Work PR

```bash
git switch develop
git pull --ff-only

git switch -c feat/short-topic
# edit, test, commit atomically
git add <files>
git commit -m "feat(api): add the thing"

git push -u origin feat/short-topic
gh pr create --base develop --fill
```

Rules:

- One logical change per pull request. A refactor that prepares a fix is a
  separate PR from the fix.
- Commit messages follow Conventional Commits with a scope:
  `feat(api)`, `fix(web)`, `docs(readme)`, `chore(ci)`, `refactor(retrieval)`.
  The subject is imperative and under ~72 characters.
- Tests, docs and `.env.example` are updated in the **same** PR as the code
  they describe.
- Review feedback is addressed by pushing new commits to the same branch.
  Do not force-push a branch another person may have based work on.
- The author does not merge their own PR unless the maintainer asked for it
  explicitly in the current session.

### Merge strategy

**Merge commits everywhere.** `gh pr merge <n> --merge --delete-branch`.

Squash and rebase merges are disabled because the commit ledger is part of the
hackathon deliverable (`HACKATHON.md`): provenance matters, and a squashed
merge erases the atomic commits we want to show.

## Promotion to production

1. `develop` is green: `bun run typecheck`, `bun run test`, `bun run build`,
   plus the local probes from `.opencode/skills/sps-quality-gates`.
2. Open a PR `develop → main`:

   ```bash
   gh pr create --base main --head develop --title "release: promote <theme>"
   ```

   The body lists the merged PRs since the previous promotion and the checks.

3. Merge with a merge commit. The API host redeploys from `main`; the console
   is rebuilt from the same commit.
4. Verify production (`/health`, `/v1/auth/captcha`, `/v1/auth/setup`, a
   protected route answering `401`, the console loads).

## Mirror to the hackathon branch

After each promotion, mirror the integration branch:

```bash
gh pr create --base meta-hackathon --head develop \
  --title "chore: mirror develop into meta-hackathon"
gh pr merge <n> --merge
```

`meta-hackathon` is a **mirror**, not a fork: it must never receive a change
that `develop` does not already contain. If the two ever diverge, bring the
missed work into `develop` first, then mirror.

## Hotfix

```bash
git switch main && git pull --ff-only
git switch -c fix/<slug>
# fix, test, commit
git push -u origin fix/<slug>
gh pr create --base main --head fix/<slug>
```

After the merge and the deploy verification:

1. back-merge `main` into `develop` (PR `main → develop`);
2. mirror `develop → meta-hackathon`.

## Bootstrap (one-off, already done)

Synchronising long-lived branches happens **before** protection is enabled:

```bash
# develop was 40 commits behind main
git switch develop && git merge --ff-only main && git push origin develop

# meta-hackathon carried old merge commits only; syncing its tree to main
git switch -c chore/sync-meta-hackathon origin/meta-hackathon
git merge --no-ff main
git push -u origin chore/sync-meta-hackathon
gh pr create --base meta-hackathon --head chore/sync-meta-hackathon
```

A push to a protected branch during a documented bootstrap uses the explicit
bypass, never the default:

```bash
ALLOW_PROTECTED_BRANCH_PUSH=1 git push origin develop
```

## Local guard

```bash
make hooks                       # or ./scripts/install-git-hooks.sh
```

The installer sets `core.hooksPath=.githooks` (idempotent). `.githooks/pre-push`
refuses any push whose destination is `main`, `develop` or `meta-hackathon`,
including a branch deletion. It prints the PR procedure and exits non-zero.

The hook is a local guard-rail only. It is not a security boundary: a clone
without the hook, or `--no-verify`, bypasses it. GitHub branch protection is the
authoritative lock.

## GitHub branch protection

Applied to `main`, `develop` and `meta-hackathon`:

- pull request required before merging;
- force-push and deletion blocked;
- rules apply to administrators too;
- zero required approvals (single-maintainer repository), but the PR exists.

```bash
gh api --method PUT "repos/<owner>/<repo>/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

Repeat for `develop` and `meta-hackathon`. On a private repository, branch
protection requires a plan that supports it; the console toggles are equivalent.

`gh pr merge` runs server-side, so it keeps working with the local pre-push
hook installed.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `pre-push: refusing to update protected branch` | pushed while on `main`/`develop` | create a topic branch, push it, open the PR |
| `gh pr merge` says "not mergeable" | branch protection or stale base | update the branch from `develop`, re-run checks |
| `develop` is behind `main` | a hotfix merged into `main` only | PR `main → develop` |
| `meta-hackathon` diverged | a change landed on `develop` without mirroring | mirror the missing commits through `develop`, then PR |
| A browser shows an old API address | `NEXT_PUBLIC_*` is inlined | rebuild the console |

Never resolve a divergence by force-pushing a long-lived branch.
