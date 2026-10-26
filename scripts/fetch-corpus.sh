#!/usr/bin/env bash
# Fetch the public reference corpus (PDFs) that are NOT committed to git.
#
# The manifests (data/**/manifest.json) are versioned; the large public PDFs are
# not. This script restores the payloads from a local copy of the upstream
# reference corpus (`.reference/`) when present, otherwise prints the sources.
#
#   ./scripts/fetch-corpus.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/.reference/AI_Strategies"
AFRICA="$ROOT/data/global/africa"

if [[ ! -d "$SRC" ]]; then
  echo "Local reference repo not found at: $SRC"
  echo
  echo "Either:"
  echo "  1. Drop the global AI-strategy documents into .reference/AI_Strategies, or"
  echo "  2. Obtain the documents from their official sources listed in"
  echo "     data/global/africa/manifest.json (field: sourceUrl)."
  exit 1
fi

mkdir -p "$AFRICA"
shopt -s nullglob
copied=0
for f in \
  African_Union_Continental_AI_Strategy_2024.pdf \
  Africa_Declaration_AI_Kigali_2025.pdf \
  Smart_Africa_AI_Blueprint_2021.pdf \
  Windhoek_Statement_AI_Southern_Africa_2022.pdf \
  Rwanda_National_AI_Policy_2023.pdf \
  Nigeria_NITDA_AI_Transformation_Roadmap_2025.pdf \
  Kenya_AI_Strategy_2025-2030.pdf \
  Kenya_AI_Strategy_2025_2030_summary.txt \
  Kenya_AI_Strategy_Implementation_Roadmap_2025-2030.pdf \
  Zambia_AI_Strategy_2024_2026.pdf \
  Egypt_AI_Strategy_2025_2030.pdf ; do
  if [[ -f "$SRC/$f" ]]; then
    cp "$SRC/$f" "$AFRICA/"
    copied=$((copied + 1))
  fi
done
shopt -u nullglob

echo "Fetched $copied file(s) into data/global/africa/."
echo "Ingest with: ./scripts/seed.sh --country global --jurisdiction regional --doc-type strategy --dir data/global/africa"
