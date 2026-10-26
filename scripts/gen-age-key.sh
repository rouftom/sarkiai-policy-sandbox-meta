#!/usr/bin/env bash
# Generate an age key pair for SOPS (run once per machine).
#
#   ./scripts/gen-age-key.sh
#
# The private key is stored (git-ignored) at ./secrets/age.key.
# Copy the printed PUBLIC key into .sops.yaml, then `make secrets-encrypt`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY_DIR="$ROOT/secrets"
KEY_FILE="$KEY_DIR/age.key"

if ! command -v age-keygen >/dev/null 2>&1; then
  echo "age-keygen not found. Install age: https://github.com/FiloSottile/age#installation" >&2
  echo "  Debian/Ubuntu: sudo apt install age" >&2
  echo "  macOS:         brew install age" >&2
  exit 1
fi

mkdir -p "$KEY_DIR"
if [[ -f "$KEY_FILE" ]]; then
  echo "Key already exists at $KEY_FILE (keeping it)."
else
  age-keygen -o "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  echo "Key written to $KEY_FILE"
fi

PUBLIC_KEY="$(grep -oE 'age1[0-9a-z]+' "$KEY_FILE" | head -1)"
echo
echo "Public key (put this in .sops.yaml):"
echo "  $PUBLIC_KEY"
