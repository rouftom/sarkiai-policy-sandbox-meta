#!/usr/bin/env bash
# Seed the knowledge base from a corpus directory.
#
#   ./scripts/seed.sh                                   # local docker stack
#   ./scripts/seed.sh --api http://localhost:8001 --country cm
#   ./scripts/seed.sh --api https://api.example --country cm --dir data/samples
set -euo pipefail

API="http://localhost:8001"
COUNTRY="cm"
JURISDICTION="national"
DOC_TYPE="policy"
DIR="data/samples"
API_KEY="${SERVICE_API_KEY:-change-me-service-key}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api) API="$2"; shift 2 ;;
    --country) COUNTRY="$2"; shift 2 ;;
    --jurisdiction) JURISDICTION="$2"; shift 2 ;;
    --doc-type) DOC_TYPE="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --key) API_KEY="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ ! -d "$DIR" ]]; then
  echo "Corpus directory '$DIR' not found." >&2
  exit 1
fi

shopt -s nullglob
count=0
for file in "$DIR"/*; do
  [[ -f "$file" ]] || continue
  echo "→ ingesting $(basename "$file") (country=$COUNTRY, type=$DOC_TYPE)"
  curl -fsS -X POST "$API/v1/ingest/file" \
    -H "X-API-Key: $API_KEY" \
    -F "file=@$file" \
    -F "country=$COUNTRY" \
    -F "jurisdiction=$JURISDICTION" \
    -F "docType=$DOC_TYPE"
  echo
  count=$((count + 1))
done
shopt -u nullglob

echo "Done: $count file(s) ingested."
