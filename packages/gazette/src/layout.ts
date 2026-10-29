/**
 * Page layout for scanned gazettes · recursive XY-cut on ink projection
 * profiles.
 *
 * A scanned page has no text layer, so the first job is geometry: find the
 * whitespace gutters that separate columns, the whitespace bands that separate
 * paragraphs, and the blocks that are neither (tables, stamps). This module is
 * deliberately model-free and deterministic: the same page always yields the
 * same boxes, which is what makes provenance auditable.
 *
 * The output is a reading-order list of boxes. The vision model then transcribes
 * one crop per box, so a wrong cut is visible in the console instead of being
 * silently averaged into a page-level OCR blob.
 */

import type { GrayImage } from './image.js'

export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

/** 1 byte per pixel: 1 = ink, 0 = paper. */
export interface InkMask {
  width: number
  height: number
  data: Uint8Array
}

export interface LayoutOptions {
  /** Ink threshold (0–255). Defaults to Otsu on the page histogram. */
  threshold?: number
  /** Maximum recursion depth. Four levels cover header / columns / paragraphs. */
  maxDepth?: number
  /** Vertical whitespace (px) that separates two paragraphs. */
  paragraphGap?: number
  /** Horizontal whitespace (px) that separates two columns. */
  columnGap?: number
  /** Drop leaves smaller than this many pixels on either side (scan noise). */
  minLeaf?: number
  /** Merge the closest neighbours until at most this many zones remain. */
  maxZones?: number
}

export interface PageLayout {
  width: number
  height: number
  threshold: number
  /** Ink density of the whole page (0–1), a cheap quality signal. */
  inkRatio: number
  /** Vertical bands detected on the body band, left to right. */
  columns: BBox[]
  /** Reading-order leaves: one per paragraph, heading, table or figure. */
  regions: BBox[]
}

const DEFAULTS = {
  maxDepth: 4,
  minLeaf: 8,
  maxZones: 24,
}

/** Otsu's method on the 256-bin histogram. Returns 0 for a blank page. */
export function otsuThreshold(gray: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0)
  for (let i = 0; i < gray.length; i += 1) histogram[gray[i] ?? 255] = (histogram[gray[i] ?? 255] ?? 0) + 1

  const total = gray.length
  if (total === 0) return 0

  let sum = 0
  for (let level = 0; level < 256; level += 1) sum += level * (histogram[level] ?? 0)

  let sumBackground = 0
  let weightBackground = 0
  let best = 0
  let bestVariance = -1
  for (let level = 0; level < 256; level += 1) {
    const count = histogram[level] ?? 0
    if (count === 0) continue
    weightBackground += count
    if (weightBackground === total) break
    const weightForeground = total - weightBackground
    sumBackground += level * count
    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sum - sumBackground) / weightForeground
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2
    if (variance > bestVariance) {
      bestVariance = variance
      best = level
    }
  }
  return best
}

/** Binarise a grayscale page: anything at or below the threshold is ink. */
export function inkMask(image: GrayImage, threshold = otsuThreshold(image.data)): InkMask {
  const data = new Uint8Array(image.width * image.height)
  for (let i = 0; i < data.length; i += 1) data[i] = (image.data[i] ?? 255) <= threshold ? 1 : 0
  return { width: image.width, height: image.height, data }
}

function inkRatio(mask: InkMask): number {
  let ink = 0
  for (let i = 0; i < mask.data.length; i += 1) ink += mask.data[i] ?? 0
  return mask.data.length ? ink / mask.data.length : 0
}

function rowProfile(mask: InkMask, box: BBox): Int32Array {
  const profile = new Int32Array(box.height)
  for (let row = 0; row < box.height; row += 1) {
    let count = 0
    const base = (box.y + row) * mask.width + box.x
    for (let col = 0; col < box.width; col += 1) count += mask.data[base + col] ?? 0
    profile[row] = count
  }
  return profile
}

function columnProfile(mask: InkMask, box: BBox): Int32Array {
  const profile = new Int32Array(box.width)
  for (let row = 0; row < box.height; row += 1) {
    const base = (box.y + row) * mask.width + box.x
    for (let col = 0; col < box.width; col += 1) profile[col] = (profile[col] ?? 0) + (mask.data[base + col] ?? 0)
  }
  return profile
}

interface Run {
  start: number
  end: number
}

/**
 * Internal empty runs of a profile. Leading and trailing runs are margins, not
 * separators: a page always has whitespace before the first and after the last
 * line, and cutting there would produce empty leaves.
 */
function emptyRuns(profile: Int32Array, tolerance: number, minLength: number): Run[] {
  const runs: Run[] = []
  let start = -1
  for (let i = 0; i <= profile.length; i += 1) {
    const empty = i < profile.length && (profile[i] ?? 0) <= tolerance
    if (empty && start < 0) start = i
    if (!empty && start >= 0) {
      runs.push({ start, end: i })
      start = -1
    }
  }
  return runs.filter((run) => run.start > 0 && run.end < profile.length && run.end - run.start >= minLength)
}

function trimToInk(mask: InkMask, box: BBox): BBox | null {
  let left = box.x + box.width
  let right = box.x
  let top = box.y + box.height
  let bottom = box.y
  for (let row = box.y; row < box.y + box.height; row += 1) {
    const base = row * mask.width
    for (let col = box.x; col < box.x + box.width; col += 1) {
      if ((mask.data[base + col] ?? 0) === 0) continue
      if (col < left) left = col
      if (col > right) right = col
      if (row < top) top = row
      if (row > bottom) bottom = row
    }
  }
  if (right < left || bottom < top) return null
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

function split(box: BBox, runs: Run[], axis: 'rows' | 'columns'): BBox[] {
  const parts: BBox[] = []
  let cursor = axis === 'rows' ? box.y : box.x
  const limit = axis === 'rows' ? box.y + box.height : box.x + box.width
  for (const run of runs) {
    const start = axis === 'rows' ? run.start + box.y : run.start + box.x
    if (start > cursor) {
      parts.push(
        axis === 'rows'
          ? { x: box.x, y: cursor, width: box.width, height: start - cursor }
          : { x: cursor, y: box.y, width: start - cursor, height: box.height },
      )
    }
    cursor = axis === 'rows' ? run.end + box.y : run.end + box.x
  }
  if (cursor < limit) {
    parts.push(
      axis === 'rows'
        ? { x: box.x, y: cursor, width: box.width, height: limit - cursor }
        : { x: cursor, y: box.y, width: limit - cursor, height: box.height },
    )
  }
  return parts
}

function cut(
  mask: InkMask,
  box: BBox,
  axis: 'rows' | 'columns',
  depth: number,
  options: Required<Pick<LayoutOptions, 'maxDepth' | 'minLeaf'>> & LayoutOptions,
  triedOther: boolean,
): BBox[] {
  const trimmed = trimToInk(mask, box)
  if (!trimmed) return []
  if (depth >= options.maxDepth) return [trimmed]

  const horizontal = axis === 'rows'
  const profile = horizontal ? rowProfile(mask, trimmed) : columnProfile(mask, trimmed)
  const tolerance = Math.max(1, Math.round((horizontal ? trimmed.width : trimmed.height) * 0.002))
  const minGap = horizontal
    ? (options.paragraphGap ?? Math.max(12, Math.round(mask.height * 0.011)))
    : (options.columnGap ?? Math.max(18, Math.round(mask.width * 0.028)))
  const runs = emptyRuns(profile, tolerance, minGap)

  if (runs.length > 0) {
    const parts = split(trimmed, runs, axis)
    const next = horizontal ? 'columns' : 'rows'
    return parts.flatMap((part) => cut(mask, part, next, depth + 1, options, false))
  }

  // A block can be column-separated without paragraph gaps (or the reverse).
  if (!triedOther) return cut(mask, trimmed, horizontal ? 'columns' : 'rows', depth, options, true)

  return [trimmed]
}

/**
 * Vertical bands on the densest body band. Also used as a fallback when the
 * top-level XY-cut finds no gap at all (a page whose header touches the body).
 */
export function detectColumns(mask: InkMask, options: LayoutOptions = {}): BBox[] {
  const y0 = Math.round(mask.height * 0.22)
  const y1 = Math.round(mask.height * 0.95)
  const band: BBox = { x: 0, y: y0, width: mask.width, height: Math.max(1, y1 - y0) }
  const profile = columnProfile(mask, band)
  const tolerance = Math.max(1, Math.round(band.height * 0.002))
  const minGap = options.columnGap ?? Math.max(18, Math.round(mask.width * 0.028))
  const runs = emptyRuns(profile, tolerance, minGap)

  const bands: BBox[] = []
  const minColumn = Math.round(mask.width * 0.1)
  let cursor = 0
  for (const run of [...runs, { start: mask.width, end: mask.width }]) {
    const width = run.start - cursor
    if (width >= minColumn) {
      bands.push({ x: cursor, y: band.y, width, height: band.height })
    }
    cursor = run.end
  }

  const kept = bands
    .map((candidate) => {
      const trimmed = trimToInk(mask, candidate)
      return trimmed ? { ...trimmed, y: band.y, height: band.height } : null
    })
    .filter((candidate): candidate is BBox => Boolean(candidate))

  if (kept.length >= 2) {
    // Measure the real vertical extent of the gutter between the first two
    // columns, so the overlay shows the body, not the whole page.
    const gutterStart = kept[0]!.x + kept[0]!.width
    const gutterEnd = kept[1]!.x
    let bestStart = band.y
    let bestEnd = band.y + band.height
    let bestLength = 0
    let rowStart = -1
    for (let row = 0; row <= mask.height; row += 1) {
      let empty = row < mask.height
      if (empty) {
        const base = row * mask.width
        for (let col = gutterStart; col < gutterEnd; col += 1) {
          if ((mask.data[base + col] ?? 0) !== 0) {
            empty = false
            break
          }
        }
      }
      if (empty && rowStart < 0) rowStart = row
      if (!empty && rowStart >= 0) {
        if (row - rowStart > bestLength) {
          bestLength = row - rowStart
          bestStart = rowStart
          bestEnd = row
        }
        rowStart = -1
      }
    }
    if (bestLength < band.height * 0.2) {
      bestStart = band.y
      bestEnd = band.y + band.height
    }
    return kept.map((candidate) => ({ ...candidate, y: bestStart, height: bestEnd - bestStart }))
  }

  return [{ x: 0, y: 0, width: mask.width, height: mask.height }]
}

function area(box: BBox): number {
  return box.width * box.height
}

function union(a: BBox, b: BBox): BBox {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

/** Merge the closest vertical neighbours until the zone budget is met. */
function capZones(boxes: BBox[], cap: number): BBox[] {
  const working = boxes.map((box) => ({ ...box }))
  while (working.length > cap) {
    let bestIndex = -1
    let bestGap = Number.POSITIVE_INFINITY
    for (let i = 0; i < working.length - 1; i += 1) {
      const a = working[i]!
      const b = working[i + 1]!
      const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      if (overlap < Math.min(a.width, b.width) * 0.5) continue
      const gap = b.y - (a.y + a.height)
      if (gap < bestGap) {
        bestGap = gap
        bestIndex = i
      }
    }
    if (bestIndex < 0) {
      // No vertical neighbour in the same column: fold the smallest leaf into
      // its nearest neighbour by centre distance.
      let smallest = 0
      for (let i = 1; i < working.length; i += 1) if (area(working[i]!) < area(working[smallest]!)) smallest = i
      const victim = working[smallest]!
      let nearest = smallest === 0 ? 1 : 0
      let nearestDistance = Number.POSITIVE_INFINITY
      for (let i = 0; i < working.length; i += 1) {
        if (i === smallest) continue
        const other = working[i]!
        const dx = victim.x + victim.width / 2 - (other.x + other.width / 2)
        const dy = victim.y + victim.height / 2 - (other.y + other.height / 2)
        const distance = dx * dx + dy * dy
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearest = i
        }
      }
      const merged = union(victim, working[nearest]!)
      const target = Math.min(smallest, nearest)
      working.splice(Math.max(smallest, nearest), 1)
      working[target] = merged
      continue
    }
    working.splice(bestIndex, 2, union(working[bestIndex]!, working[bestIndex + 1]!))
  }
  return working
}

/** Segment a binarised page into reading-order zones. */
export function pageLayout(mask: InkMask, options: LayoutOptions = {}): PageLayout {
  const resolved = {
    ...options,
    maxDepth: options.maxDepth ?? DEFAULTS.maxDepth,
    minLeaf: options.minLeaf ?? DEFAULTS.minLeaf,
    maxZones: options.maxZones ?? DEFAULTS.maxZones,
  }
  const page: BBox = { x: 0, y: 0, width: mask.width, height: mask.height }
  const columns = detectColumns(mask, options)

  let regions: BBox[]
  if (columns.length > 1) {
    // Column-major reading order: a gazette reads one column to the bottom, then
    // the next. A row-major XY-cut would interleave two unrelated articles
    // whenever their paragraphs happen to line up.
    const bodyTop = Math.min(...columns.map((column) => column.y))
    const bodyBottom = Math.max(...columns.map((column) => column.y + column.height))
    const header = bodyTop > 2 ? trimToInk(mask, { x: 0, y: 0, width: mask.width, height: bodyTop }) : null
    const body = columns.flatMap((column) =>
      cut(
        mask,
        { x: column.x, y: bodyTop, width: column.width, height: Math.max(1, bodyBottom - bodyTop) },
        'rows',
        1,
        resolved,
        false,
      ),
    )
    regions = [...(header ? [header] : []), ...body]
  } else {
    regions = cut(mask, page, 'rows', 0, resolved, false)
  }

  regions = regions
    .filter((box) => box.width >= resolved.minLeaf && box.height >= resolved.minLeaf)
    .filter((box) => {
      if (box.width * box.height === 0) return false
      let ink = 0
      for (let row = box.y; row < box.y + box.height; row += 1) {
        const base = row * mask.width + box.x
        for (let col = 0; col < box.width; col += 1) ink += mask.data[base + col] ?? 0
      }
      return ink >= 12
    })

  if (regions.length === 0) {
    const whole = trimToInk(mask, page)
    regions = whole ? [whole] : []
  }

  return {
    width: mask.width,
    height: mask.height,
    threshold: options.threshold ?? 0,
    inkRatio: inkRatio(mask),
    columns,
    regions: capZones(regions, resolved.maxZones),
  }
}

/** Index (1-based) of the column containing a box, for provenance. */
export function columnOf(box: BBox, columns: BBox[]): number {
  if (columns.length <= 1) return 1
  const centre = box.x + box.width / 2
  for (let i = 0; i < columns.length; i += 1) {
    const column = columns[i]!
    if (centre >= column.x && centre <= column.x + column.width) return i + 1
  }
  // A full-width header covers several columns: it belongs to the first one.
  const covered = columns.filter(
    (column) => column.x + column.width / 2 >= box.x && column.x + column.width / 2 <= box.x + box.width,
  )
  if (covered.length >= 2) return 1
  let nearest = 1
  let distance = Number.POSITIVE_INFINITY
  for (let i = 0; i < columns.length; i += 1) {
    const column = columns[i]!
    const d = Math.abs(centre - (column.x + column.width / 2))
    if (d < distance) {
      distance = d
      nearest = i + 1
    }
  }
  return nearest
}

/** Overlap area of two boxes, 0 when they do not touch. */
export function overlapArea(a: BBox, b: BBox): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return width > 0 && height > 0 ? width * height : 0
}

/** Fraction of `inner` covered by `outer`. */
export function coverage(inner: BBox, outer: BBox): number {
  const total = inner.width * inner.height
  return total > 0 ? overlapArea(inner, outer) / total : 0
}
