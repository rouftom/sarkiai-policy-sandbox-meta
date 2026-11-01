#!/usr/bin/env bash
# Seed the knowledge base from a corpus directory.
#
#   ./scripts/seed.sh                                   # local docker stack
#   ./scripts/seed.sh --api http://localhost:8001 --country cm
#   ./scripts/seed.sh --api https://api.example --country cm --dir data/samples --rights open-licence
#
# Rights are mandatory. When the directory holds a `manifest.json`, each file
# takes the `rights` recorded for it there; otherwise pass `--rights` for the
# whole directory. Files whose rights are `quotation-only`, `to-confirm` or
# simply absent are skipped: only `official-text` and `open-licence` may enter
# the knowledge base. See docs/LICENSING.md.
set -euo pipefail

API="http://localhost:8001"
COUNTRY="cm"
JURISDICTION="national"
DOC_TYPE="policy"
DIR="data/samples"
RIGHTS=""
API_KEY="${SERVICE_API_KEY:-change-me-service-key}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api) API="$2"; shift 2 ;;
    --country) COUNTRY="$2"; shift 2 ;;
    --jurisdiction) JURISDICTION="$2"; shift 2 ;;
    --doc-type) DOC_TYPE="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --rights) RIGHTS="$2"; shift 2 ;;
    --key) API_KEY="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

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
  echo "→ ingesting $(basename "$file") (country=$COUNTRY, type=$DOC_TYPE, rights=$rights)"
  curl -fsS -X POST "$API/v1/ingest/file" \
    -H "X-API-Key: $API_KEY" \
    -F "file=@$file" \
    -F "country=$COUNTRY" \
    -F "jurisdiction=$JURISDICTION" \
    -F "docType=$DOC_TYPE" \
    -F "rights=$rights"
  echo
  count=$((count + 1))
done
shopt -u nullglob

echo "Done: $count file(s) ingested, $skipped skipped for rights."
