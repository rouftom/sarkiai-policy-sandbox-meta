import { describe, expect, test } from 'bun:test'
import { columnOf, detectColumns, inkMask, otsuThreshold, pageLayout, type InkMask } from './layout.js'

/** Paint an ink rectangle into a mask. */
function fill(mask: InkMask, x: number, y: number, width: number, height: number): void {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) mask.data[row * mask.width + col] = 1
  }
}

/** A page shaped like a gazette: full-width header, two columns, paragraphs. */
function gazetteMask(): InkMask {
  const width = 1000
  const height = 1400
  const mask: InkMask = { width, height, data: new Uint8Array(width * height) }

  // Header, full width.
  fill(mask, 180, 40, 640, 40)
  fill(mask, 260, 90, 480, 16)

  // Column 1 — three paragraphs.
  fill(mask, 60, 200, 400, 56)
  fill(mask, 60, 300, 400, 76)
  fill(mask, 60, 420, 400, 72)

  // Column 2 — two paragraphs.
  fill(mask, 540, 200, 400, 72)
  fill(mask, 540, 320, 400, 72)

  return mask
}

describe('layout — projection profiles', () => {
  test('Otsu separates ink from paper on a bimodal page', () => {
    const gray = new Uint8Array(1000)
    gray.fill(240, 0, 700)
    gray.fill(30, 700)
    const threshold = otsuThreshold(gray)
    expect(threshold).toBeGreaterThanOrEqual(30)
    expect(threshold).toBeLessThan(240)
  })

  test('finds the gutter and both columns on a gazette page', () => {
    const mask = gazetteMask()
    const layout = pageLayout(mask, { maxZones: 24 })
    expect(layout.columns.length).toBe(2)
    expect(layout.columns[0]!.x).toBeLessThan(layout.columns[1]!.x)
    expect(layout.columns[0]!.width).toBeGreaterThan(350)
  })

  test('returns one zone per paragraph in reading order', () => {
    const layout = pageLayout(gazetteMask(), { maxZones: 24 })
    expect(layout.regions.length).toBeGreaterThanOrEqual(5)

    // Top-to-bottom, left-to-right: header first, then column 1, then column 2.
    const ys = layout.regions.map((region) => region.y)
    expect(ys[0]).toBeLessThan(120)
    const firstColumn = layout.regions.filter((region) => region.x < 500)
    const secondColumn = layout.regions.filter((region) => region.x >= 500)
    expect(firstColumn.length).toBeGreaterThanOrEqual(3)
    expect(secondColumn.length).toBeGreaterThanOrEqual(2)
    expect(Math.max(...firstColumn.map((region) => region.y))).toBeGreaterThan(
      Math.min(...secondColumn.map((region) => region.y)),
    )
  })

  test('merges neighbours when the zone budget is smaller than the page', () => {
    const layout = pageLayout(gazetteMask(), { maxZones: 2 })
    expect(layout.regions.length).toBe(2)
  })

  test('maps a zone to its 1-based column', () => {
    const layout = pageLayout(gazetteMask())
    const left = layout.regions.find((region) => region.x < 300)!
    const right = layout.regions.find((region) => region.x > 500)!
    expect(columnOf(left, layout.columns)).toBe(1)
    expect(columnOf(right, layout.columns)).toBe(2)
  })

  test('a blank page has no ink and no columns', () => {
    const mask: InkMask = { width: 200, height: 300, data: new Uint8Array(200 * 300) }
    const layout = pageLayout(mask)
    expect(layout.regions).toEqual([])
    expect(layout.inkRatio).toBe(0)
    expect(detectColumns(mask).length).toBe(1)
    expect(inkMask({ width: 1, height: 1, data: new Uint8Array([255]) }).data[0]).toBe(0)
  })
})
