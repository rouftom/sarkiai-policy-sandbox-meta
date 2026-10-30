# Secrets management (SOPS + age)

Secrets are stored **encrypted in git** so the repo carries everything it needs
without a secret server. Locally, `.env` stays plaintext and git-ignored.

## One-time setup

```bash
./scripts/gen-age-key.sh          # creates secrets/age.key (git-ignored) + prints the public key
# paste the printed age1... into .sops.yaml (both `age:` fields)
```

## Encrypt / edit / decrypt

```bash
make secrets-encrypt              # .env -> .env.enc (committed)
sops .env.enc                     # edit in place (decrypts in memory)
sops --decrypt .env.enc > .env    # restore a local .env on a new machine
```

Docker Compose keeps using the plaintext `.env`; SOPS only protects the copy in
git.

## Rules

- **Commit only `*.env.enc`**: never `.env` (already git-ignored).
- The **private key `secrets/age.key` is never committed** (git-ignored).
- Rotate by editing `.env.enc` with `sops` and re-encrypting; no service to run.
- For a team/UI workflow, an alternative is self-hosted Infisical: but SOPS+age
  is the default here (no server, aligned with the local/sovereign posture).

## Per-environment layering

Combine SOPS with compose layers:

| Environment | Compose | Non-secret config | Secrets |
|-------------|---------|-------------------|---------|
| dev | `docker-compose.yml` | `.env.example` | `.env.enc` |
| local | `+ docker-compose.dev.yml` | `.env` | `.env.enc` |
| sandbox (locked-down) | `deploy/sandbox/docker-compose.sandbox.yml` | `.env.sandbox` | `deploy/sandbox/*.enc.yaml` |
