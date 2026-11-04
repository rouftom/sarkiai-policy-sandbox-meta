/**
 * Assistant image limits. The deployment owns the values and publishes them on
 * `GET /v1/attachments/limits`; these defaults apply until that call answers, so
 * a fresh console already refuses what the API would refuse.
 */

export interface AttachmentLimits {
  /** Images accepted in one message. */
  maxImages: number
  /** Bytes accepted in one image. */
  maxBytes: number
  /** MIME types accepted as images. */
  mimeTypes: string[]
}

export const DEFAULT_ATTACHMENT_LIMITS: AttachmentLimits = {
  maxImages: 4,
  maxBytes: 2 * 1024 * 1024,
  mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
}

/** Why a selection was refused, most specific first. */
export type AttachmentError = 'type' | 'size' | 'count'

/** Human-readable size for the composer's messages. */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${Number.isInteger(mb) ? mb.toFixed(0) : mb.toFixed(1)} MB`
}

/**
 * Keep the images a message may carry: right type, within the per-image size,
 * up to the remaining room. `error` reports the first reason files were left
 * out so the composer can say why. Files that pass are still returned when
 * some were refused: a mixed selection keeps its valid images.
 */
export function pickImages(
  input: Iterable<File>,
  limits: AttachmentLimits,
  room: number,
): { picked: File[]; error: AttachmentError | null } {
  const all = Array.from(input)
  const images = all.filter((file) => limits.mimeTypes.includes(file.type))
  const sized = images.filter((file) => file.size <= limits.maxBytes)
  const picked = sized.slice(0, Math.max(0, room))
  const error: AttachmentError | null =
    images.length < all.length
      ? 'type'
      : sized.length < images.length
        ? 'size'
        : sized.length > picked.length
          ? 'count'
          : null
  return { picked, error }
}
