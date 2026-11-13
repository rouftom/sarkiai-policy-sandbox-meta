/**
 * Build a compact SVG choropleth geometry for the World page from Natural Earth
 * 1:110m admin-0 countries (public domain). Equirectangular projection, cropped
 * to 84°N–60°S (Antarctica omitted), coordinates rounded to one decimal.
 *
 *   bun build-world-geo.ts /tmp/opencode/ne110m.geojson > world-geo.ts
 */
import { readFileSync } from 'node:fs'

const WIDTH = 1000
const NORTH = 84
const SOUTH = -60
const HEIGHT = Math.round(((NORTH - SOUTH) / 360) * WIDTH) // 400

type Ring = Array<[number, number]>

const source = JSON.parse(readFileSync(process.argv[2], 'utf8')) as {
  features: Array<{
    properties: Record<string, unknown>
    geometry: { type: string; coordinates: unknown }
  }>
}

const round = (n: number) => Math.round(n * 10) / 10

function project([lon, lat]: [number, number]): [number, number] {
  return [round(((lon + 180) / 360) * WIDTH), round(((NORTH - lat) / (NORTH - SOUTH)) * HEIGHT)]
}

/** Douglas–Peucker on projected points, tolerance in viewBox units. */
function simplify(points: Ring, tolerance: number): Ring {
  if (points.length <= 3) return points
  const sqTolerance = tolerance * tolerance
  const sqSegDist = (p: [number, number], a: [number, number], b: [number, number]) => {
    let x = a[0]
    let y = a[1]
    let dx = b[0] - x
    let dy = b[1] - y
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy)
      if (t > 1) {
        x = b[0]
        y = b[1]
      } else if (t > 0) {
        x += dx * t
        y += dy * t
      }
    }
    dx = p[0] - x
    dy = p[1] - y
    return dx * dx + dy * dy
  }
  const sqDistToSegment = (p: [number, number], a: [number, number], b: [number, number]) => sqSegDist(p, a, b)

  const sqDistToSegmentSq = sqDistToSegment
  const simplifyStep = (first: number, last: number, out: boolean[]) => {
    let maxSq = sqTolerance
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const sq = sqDistToSegmentSq(points[i], points[first], points[last])
      if (sq > maxSq) {
        index = i
        maxSq = sq
      }
    }
    if (index > 0) {
      out[index] = true
      simplifyStep(first, index, out)
      simplifyStep(index, last, out)
    }
  }
  const keep = new Array(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  simplifyStep(0, points.length - 1, keep)
  return points.filter((_, i) => keep[i])
}

function ringsOf(geometry: { type: string; coordinates: unknown }): Ring[] {
  if (geometry.type === 'Polygon') return geometry.coordinates as Ring[]
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates as Ring[][]).flat()
  return []
}

/**
 * Cut a ring where it crosses the antimeridian: an equirectangular projection
 * would otherwise draw a horizontal band across the whole map (Alaska, Fiji).
 * Each run is closed along the cut, which is invisible at this scale.
 */
function splitAtAntimeridian(ring: Ring): Ring[] {
  const runs: Ring[] = []
  let run: Ring = [ring[0]]
  for (let i = 1; i < ring.length; i++) {
    const previous = ring[i - 1]
    const current = ring[i]
    if (Math.abs(current[0] - previous[0]) > 180) {
      if (run.length >= 3) runs.push(run)
      run = [current]
    } else {
      run.push(current)
    }
  }
  if (run.length >= 3) runs.push(run)
  return runs
}

const codeOf = (p: Record<string, unknown>): string => {
  const raw = (p.ISO_A2_EH ?? p.ISO_A2 ?? '') as string
  return raw && raw !== '-99' ? raw.toLowerCase() : ''
}

const byCode = new Map<string, string[]>()
const names = new Map<string, { en: string; fr: string }>()
const skipped: string[] = []

for (const feature of source.features) {
  const code = codeOf(feature.properties)
  const name = String(feature.properties.NAME_EN ?? feature.properties.ADMIN ?? '')
  if (!code) {
    skipped.push(name)
    continue
  }
  if (code === 'aq') continue // Antarctica is cropped out.
  if (!names.has(code) && name) {
    names.set(code, {
      en: name,
      fr: String(feature.properties.NAME_FR || name),
    })
  }
  const parts: string[] = []
  for (const ring of ringsOf(feature.geometry)) {
    for (const run of splitAtAntimeridian(ring)) {
      const projected = run.map(([lon, lat]) => project([lon, Math.max(SOUTH, Math.min(NORTH, lat))]))
      const simplified = simplify(projected, 1.2)
      if (simplified.length < 4) continue
      const d = simplified.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join('') + 'Z'
      if (d.length > 8) parts.push(d)
    }
  }
  if (parts.length === 0) continue
  byCode.set(code, [...(byCode.get(code) ?? []), ...parts])
}

const entries = [...byCode.entries()].sort(([a], [b]) => a.localeCompare(b))
const body = entries.map(([code, parts]) => `  ['${code}', '${parts.join('')}'],`).join('\n')
const nameBody = entries
  .map(([code]) => {
    const name = names.get(code) ?? { en: code.toUpperCase(), fr: code.toUpperCase() }
    return `  ${code}: { en: '${name.en.replace(/'/g, "\\'")}', fr: '${name.fr.replace(/'/g, "\\'")}' },`
  })
  .join('\n')
const out = `// Generated by scripts/build-world-geo.ts from Natural Earth 1:110m
// admin-0 countries (public domain, naturalearthdata.com). Do not edit by hand.
// Equirectangular projection, viewBox 0 0 ${WIDTH} ${HEIGHT}, Antarctica omitted.

export const WORLD_MAP_WIDTH = ${WIDTH}
export const WORLD_MAP_HEIGHT = ${HEIGHT}
export const WORLD_MAP_NORTH = ${NORTH}
export const WORLD_MAP_SOUTH = ${SOUTH}

/** ISO 3166-1 alpha-2 code → SVG path data (one or more polygons). */
export const WORLD_MAP_PATHS: ReadonlyArray<readonly [string, string]> = [
${body}
]

/** Natural Earth English/French names, so the map never depends on the runtime's ICU data. */
export const WORLD_MAP_NAMES: Readonly<Record<string, { en: string; fr: string }>> = {
${nameBody}
}
`
process.stdout.write(out)
console.error(`countries: ${entries.length}, bytes: ${out.length}, skipped: ${skipped.join(', ') || 'none'}`)
