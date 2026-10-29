/**
 * Image decode helpers for scanned pages and region crops.
 *
 * Only what a gazette pipeline needs: turn a PNG/JPEG page into an 8-bit
 * grayscale raster (for projection profiles) and cut a zone out of it as a PNG
 * (for the vision model). No native dependency, so the package runs unchanged
 * on a laptop, in Docker and in a serverless function.
 */

import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

export interface GrayImage {
  width: number
  height: number
  /** One byte per pixel, 0 = black, 255 = white, row-major. */
  data: Uint8Array
}

export interface ImageInfo {
  width: number
  height: number
  mime: string
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

/** Sniff the container. A declared MIME type is a hint, never a trust boundary. */
export function detectMime(bytes: Uint8Array, declared?: string): string {
  if (isPng(bytes)) return 'image/png'
  if (isJpeg(bytes)) return 'image/jpeg'
  const hint = (declared ?? '').toLowerCase().split(';')[0]?.trim()
  if (hint === 'image/png' || hint === 'image/jpeg') return hint
  throw new Error('Unsupported image. The gazette pipeline reads PNG and JPEG pages.')
}

function luma(r: number, g: number, b: number): number {
  // ITU-R BT.601, in integer arithmetic to stay deterministic across engines.
  return (r * 299 + g * 587 + b * 114 + 500) / 1000
}

/**
 * Decode a PNG or JPEG into grayscale.
 *
 * JPEG decoding is not bit-exact across libraries; PNG is. Scans are usually
 * JPEG, and projection profiles tolerate a few levels of noise.
 */
export function decodeGray(bytes: Uint8Array, mime?: string): GrayImage {
  const type = detectMime(bytes, mime)
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (type === 'image/png') {
    const png = PNG.sync.read(buffer)
    const out = new Uint8Array(png.width * png.height)
    for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
      const r = png.data[p] ?? 0
      const g = png.data[p + 1] ?? 0
      const b = png.data[p + 2] ?? 0
      const a = png.data[p + 3] ?? 255
      // Composite on white: transparent scans must not read as black ink.
      const alpha = a / 255
      // A pure-white pixel is 255.5 before rounding; a Uint8Array would wrap it
      // to 0 and turn the whole page into ink.
      out[i] = clamp(Math.round(luma(r, g, b) * alpha + 255 * (1 - alpha)), 0, 255)
    }
    return { width: png.width, height: png.height, data: out }
  }

  const raw = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true })
  const out = new Uint8Array(raw.width * raw.height)
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    out[i] = clamp(Math.round(luma(raw.data[p] ?? 0, raw.data[p + 1] ?? 0, raw.data[p + 2] ?? 0)), 0, 255)
  }
  return { width: raw.width, height: raw.height, data: out }
}

/** Read just the dimensions without converting the whole raster twice. */
export function imageInfo(bytes: Uint8Array, mime?: string): ImageInfo {
  const type = detectMime(bytes, mime)
  if (type === 'image/png') {
    const png = PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    return { width: png.width, height: png.height, mime: type }
  }
  const decoded = jpeg.decode(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
    useTArray: true,
    formatAsRGBA: true,
  })
  return { width: decoded.width, height: decoded.height, mime: type }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Crop a box out of the grayscale page and encode it as a PNG.
 *
 * A small padding keeps ascenders, descenders and cell borders intact · a
 * clipped quote is exactly the failure mode the citation validator catches.
 */
export function cropToPng(image: GrayImage, box: { x: number; y: number; width: number; height: number }, padding = 6): Buffer {
  const x = clamp(Math.floor(box.x - padding), 0, Math.max(0, image.width - 1))
  const y = clamp(Math.floor(box.y - padding), 0, Math.max(0, image.height - 1))
  const right = clamp(Math.ceil(box.x + box.width + padding), x + 1, image.width)
  const bottom = clamp(Math.ceil(box.y + box.height + padding), y + 1, image.height)
  const width = right - x
  const height = bottom - y

  const png = new PNG({ width, height, colorType: 6 })
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const value = image.data[(y + row) * image.width + (x + col)] ?? 255
      const p = (row * width + col) * 4
      png.data[p] = value
      png.data[p + 1] = value
      png.data[p + 2] = value
      png.data[p + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

/** Base64 for a data URL (no secret ever goes through here). */
export function toDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64')}`
}
