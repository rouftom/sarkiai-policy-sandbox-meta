import { describe, expect, test } from 'bun:test'
import { DEFAULT_ATTACHMENT_LIMITS, formatBytes, pickImages } from './attachment-limits'

const file = (name: string, type: string, size: number): File => ({ name, type, size }) as unknown as File

const limits = DEFAULT_ATTACHMENT_LIMITS
const IMAGE = 'image/png'

describe('assistant attachment limits', () => {
  test('defaults to four images of two megabytes', () => {
    expect(limits.maxImages).toBe(4)
    expect(limits.maxBytes).toBe(2 * 1024 * 1024)
    expect(limits.mimeTypes).toEqual(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
  })

  test('keeps four images and reports the fifth as over the count', () => {
    const files = Array.from({ length: 5 }, (_, index) => file(`${index}.png`, IMAGE, 1024))
    const { picked, error } = pickImages(files, limits, 4)
    expect(picked).toHaveLength(4)
    expect(error).toBe('count')
  })

  test('stops at the remaining room', () => {
    const { picked, error } = pickImages([file('a.png', IMAGE, 1024)], limits, 0)
    expect(picked).toEqual([])
    expect(error).toBe('count')
  })

  test('refuses a document but keeps the valid images of the same selection', () => {
    const { picked, error } = pickImages(
      [file('note.pdf', 'application/pdf', 1024), file('a.png', IMAGE, 1024)],
      limits,
      4,
    )
    expect(picked.map((entry) => entry.name)).toEqual(['a.png'])
    expect(error).toBe('type')
  })

  test('refuses an image heavier than the cap', () => {
    const { picked, error } = pickImages(
      [file('big.png', IMAGE, limits.maxBytes + 1), file('ok.jpg', 'image/jpeg', 1024)],
      limits,
      4,
    )
    expect(picked.map((entry) => entry.name)).toEqual(['ok.jpg'])
    expect(error).toBe('size')
  })

  test('accepts an image exactly at the cap', () => {
    const { picked, error } = pickImages([file('edge.webp', 'image/webp', limits.maxBytes)], limits, 4)
    expect(picked).toHaveLength(1)
    expect(error).toBeNull()
  })

  test('formats the cap for the composer message', () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe('2 MB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })
})
