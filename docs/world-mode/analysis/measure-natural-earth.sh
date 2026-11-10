#!/usr/bin/env bash
# Reproduces the Natural Earth measurements of docs/03 section 2.2.
# Needs: node, npm (mapshaper), python3 with brotli (pip install brotli). Sources are NOT committed.
set -euo pipefail
B=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
mkdir -p work/out && cd work
[ -s ne_50m_admin_0_countries.geojson ] || curl -sSL -o ne_50m_admin_0_countries.geojson "$B/ne_50m_admin_0_countries.geojson"
[ -s ne_10m_admin_1_states_provinces.geojson ] || curl -sSL -o ne_10m_admin_1_states_provinces.geojson "$B/ne_10m_admin_1_states_provinces.geojson"
npm i mapshaper --silent
for pct in 2 5 10 40; do
  npx mapshaper -i ne_50m_admin_0_countries.geojson -proj eqearth -simplify visvalingam percentage=${pct}% keep-shapes \
    -filter-fields ISO_A2_EH,NAME -o out/world_${pct}.topo.json format=topojson quantization=16000
done
npx mapshaper -i ne_10m_admin_1_states_provinces.geojson -proj eqearth -simplify visvalingam percentage=8% keep-shapes \
  -filter-fields iso_3166_2,iso_a2 -o out/adm1_ALL_8.topo.json format=topojson quantization=16000
python3 - <<'PY'
import glob, json, os, brotli
for f in sorted(glob.glob('out/*.topo.json')):
    b = open(f, 'rb').read(); d = json.loads(b)
    print(f"{os.path.basename(f):24s} raw {len(b)//1024:6d} KB | brotli {len(brotli.compress(b, quality=11))//1024:5d} KB | points {sum(len(a) for a in d['arcs'])}")
PY
