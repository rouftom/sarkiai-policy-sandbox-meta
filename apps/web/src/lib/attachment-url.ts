/**
 * Chat image URLs.
 *
 * The API stores a relative, signed read URL for S3 (so a session opened from
 * another console host still resolves) and an absolute Cloudinary URL in the
 * cloud demo. Rendering always calls this helper.
 */
import { API_URL } from './api'

export function resolveAttachmentUrl(url: string): string {
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url
  const base = API_URL.replace(/\/$/, '')
  return `${base}${url.startsWith('/') ? url : `/${url}`}`
}
