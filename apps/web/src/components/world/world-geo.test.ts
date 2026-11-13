import { describe, expect, test } from 'bun:test'
import {
  WORLD_MAP_HEIGHT,
  WORLD_MAP_NORTH,
  WORLD_MAP_PATHS,
  WORLD_MAP_SOUTH,
  WORLD_MAP_WIDTH,
} from './world-geo'

const CODES = new Set(WORLD_MAP_PATHS.map(([code]) => code))
const POINT = /[ML](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g

describe('world geometry', () => {
  test('covers the world with ISO alpha-2 codes', () => {
    expect(WORLD_MAP_PATHS.length).toBeGreaterThan(160)
    expect(new Set(WORLD_MAP_PATHS.map(([code]) => code)).size).toBe(WORLD_MAP_PATHS.length)
    for (const [code] of WORLD_MAP_PATHS) expect(code).toMatch(/^[a-z]{2}$/)
    for (const code of ['cm', 'us', 'fr', 'ng', 'cn']) expect(CODES.has(code)).toBe(true)
  })

  test('keeps every path inside the viewBox', () => {
    for (const [code, path] of WORLD_MAP_PATHS) {
      for (const match of path.matchAll(POINT)) {
        const x = Number(match[1])
        const y = Number(match[2])
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
        expect(x, `${code} x`).toBeGreaterThanOrEqual(0)
        expect(x, `${code} x`).toBeLessThanOrEqual(WORLD_MAP_WIDTH)
        expect(y, `${code} y`).toBeGreaterThanOrEqual(0)
        expect(y, `${code} y`).toBeLessThanOrEqual(WORLD_MAP_HEIGHT)
      }
    }
  })

  test('cuts the antimeridian instead of drawing across the map', () => {
    for (const [code, path] of WORLD_MAP_PATHS) {
      for (const segment of path.split('Z')) {
        const points = [...segment.matchAll(POINT)].map((match) => [Number(match[1]), Number(match[2])] as const)
        for (let index = 1; index < points.length; index++) {
          const previous = points[index - 1]!
          const current = points[index]!
          expect(Math.abs(current[0] - previous[0]), `${code} jumps across the map`).toBeLessThan(300)
        }
      }
    }
  })

  test('the projection constants describe the announced crop', () => {
    expect(WORLD_MAP_HEIGHT / WORLD_MAP_WIDTH).toBeCloseTo((WORLD_MAP_NORTH - WORLD_MAP_SOUTH) / 360, 6)
    expect(WORLD_MAP_SOUTH).toBeLessThan(-55)
  })
})
