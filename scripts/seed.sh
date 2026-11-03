#!/usr/bin/env bash
# Seed the knowledge base from a corpus directory.
#
#   export SPS_ADMIN_TOKEN=...                          # bearer from /v1/auth/login
#   ./scripts/seed.sh                                   # local docker stack
#   ./scripts/seed.sh --api http://localhost:8000 --country cm
#   ./scripts/seed.sh --api https://api.example --country cm --dir data/samples --rights open-licence
#
# Ingestion runs in-process in the API and the route is admin-only, so every
# run needs an admin session token in `SPS_ADMIN_TOKEN` (the bearer returned by
# `/v1/auth/login`). It is read from the environment, never from the command
# line, so the token does not show up in the process list or shell history.
# Set `SPS_API_URL` to point at another host without retyping `--api`.
#
# Rights are mandatory. When the directory holds a `manifest.json`, each file
# takes the `rights` recorded for it there; otherwise pass `--rights` for the
# whole directory. Files whose rights are `quotation-only`, `to-confirm` or
# simply absent are skipped: only `official-text` and `open-licence` may enter
# the knowledge base. See docs/LICENSING.md.
set -euo pipefail

API="${SPS_API_URL:-http://localhost:8000}"
COUNTRY="cm"
JURISDICTION="national"
DOC_TYPE="policy"
DIR="data/samples"
RIGHTS=""
TOKEN="${SPS_ADMIN_TOKEN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api) API="$2"; shift 2 ;;
    --country) COUNTRY="$2"; shift 2 ;;
    --jurisdiction) JURISDICTION="$2"; shift 2 ;;
    --doc-type) DOC_TYPE="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --rights) RIGHTS="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$TOKEN" ]]; then
  echo "No admin session token: export SPS_ADMIN_TOKEN (the bearer returned by /v1/auth/login)." >&2
  echo "Ingestion is admin-only; without it every request fails with HTTP 401/403." >&2
  exit 1
fi

if [[ ! -d "$DIR" ]]; then
  echo "Corpus directory '$DIR' not found." >&2
  exit 1
fi

if [[ -n "$RIGHTS" && "$RIGHTS" != "official-text" && "$RIGHTS" != "open-licence" && "$RIGHTS" != "quotation-only" && "$RIGHTS" != "to-confirm" ]]; then
  echo "Unknown --rights '$RIGHTS' (official-text | open-licence | quotation-only | to-confirm)." >&2
  exit 1
fi

MANIFEST="$DIR/manifest.json"
if [[ ! -f "$MANIFEST" && -z "$RIGHTS" ]]; then
  echo "No manifest in '$DIR' and no --rights: refusing to ingest without a rights status." >&2
  echo "Pass --rights official-text|open-licence for project-authored or licensed material." >&2
  exit 1
fi

# Rights for one file: the manifest entry wins (matching either the PDF name or
# its .txt derivative), then --rights, and otherwise fail closed to to-confirm.
rights_for() {
  local name="$1"
  if [[ -f "$MANIFEST" ]]; then
    python3 - "$MANIFEST" "$name" "${RIGHTS:-to-confirm}" <<'PY'
import json, os, sys

manifest_path, name, fallback = sys.argv[1], os.path.basename(sys.argv[2]), sys.argv[3]
with open(manifest_path, encoding="utf-8") as handle:
    manifest = json.load(handle)

def variants(value):
    base = os.path.basename(value)
    return {base, base[:-4] + ".txt" if base.lower().endswith(".pdf") else base}

for document in manifest.get("documents", []):
    source = document.get("file")
    if source and name in variants(source):
        print(document.get("rights") or "to-confirm")
        raise SystemExit(0)
print(fallback)
PY
    return
  fi
  echo "${RIGHTS:-to-confirm}"
}

shopt -s nullglob
count=0
skipped=0
for file in "$DIR"/*; do
  [[ -f "$file" ]] || continue
  [[ "$(basename "$file")" == "manifest.json" ]] && continue
  rights="$(rights_for "$file")"
  if [[ "$rights" != "official-text" && "$rights" != "open-licence" ]]; then
    echo "→ skipping $(basename "$file") (rights=$rights · full text may not be ingested)"
    skipped=$((skipped + 1))
    continue
  fi
  echo "→ ingesting $file as ${DOC_TYPE} (country=$COUNTRY, rights=$rights)"
  payload="$(
    python3 - "$file" "$COUNTRY" "$JURISDICTION" "$DOC_TYPE" "$rights" <<'PY'
import base64, json, os, sys

path, country, jurisdiction, doc_type, rights = sys.argv[1:6]
with open(path, "rb") as handle:
    encoded = base64.b64encode(handle.read()).decode("ascii")
print(json.dumps({
    "filename": os.path.basename(path),
    "contentBase64": encoded,
    "country": country,
    "jurisdiction": jurisdiction,
    "docType": doc_type,
    "rights": rights,
}))
PY
  )"
  printf '%s' "$payload" | curl -fsS -X POST "$API/v1/kb/ingest/file" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @-
  echo
  count=$((count + 1))
done
shopt -u nullglob

echo "Done: $count file(s) ingested, $skipped skipped for rights."
