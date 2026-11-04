/**
 * Media uploads to Cloudinary, in the hackathon's own namespace (a folder of the
 * account). Configured by the same variables as the organization app:
 * CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, and
 * CLOUDINARY_SPS_FOLDER for the namespace (default `sps`, never the
 * organization's `fada/resources`).
 *
 * When Cloudinary is not configured, uploads return null and the caller falls
 * back to a self-contained rendering. Secrets are never logged.
 */
import { v2 as cloudinary } from 'cloudinary'

export const SPS_FOLDER = process.env.CLOUDINARY_SPS_FOLDER || 'sps'
/** Chat attachments live under their own subtree: report figures use `sps/readiness`. */
export const ATTACHMENT_FOLDER = `${SPS_FOLDER}/attachments`

export function cloudinaryConfigured(): boolean {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
}

export interface UploadedImage {
  url: string
  publicId: string
}

/** Uploads an image (a data URI) and returns its public HTTPS address and id, or null. */
export async function uploadImage(source: string, publicId: string, folder = SPS_FOLDER): Promise<UploadedImage | null> {
  if (!cloudinaryConfigured()) return null
  configure()
  try {
    const result = await cloudinary.uploader.upload(source, {
      folder,
      public_id: publicId,
      overwrite: true,
      invalidate: true,
      resource_type: 'image',
    })
    return { url: result.secure_url, publicId: result.public_id }
  } catch (error) {
    console.error('Cloudinary upload failed:', (error as Error).message)
    return null
  }
}

/**
 * Uploads one chat attachment. The public id is its SHA-256, so an identical
 * upload reuses the same Cloudinary asset instead of duplicating it. Uniqueness
 * is also what makes the derived thumbnail URL stable across sessions.
 */
export async function uploadAttachmentImage(data: Buffer, mime: string, sha256: string): Promise<UploadedImage | null> {
  return uploadImage(`data:${mime};base64,${data.toString('base64')}`, sha256, ATTACHMENT_FOLDER)
}

/** A WebP thumbnail of an uploaded attachment, resized and compressed by Cloudinary. */
export function attachmentThumbnailUrl(publicId: string, width: number): string {
  configure()
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: 'image',
    format: 'webp',
    transformation: [{ width, height: width, crop: 'limit' }, { quality: 'auto:good' }],
  })
}

/**
 * A lighter JPEG of an uploaded image, at most `width` pixels wide, for the
 * documents: Cloudinary does the resizing and the compression.
 */
export function optimizedUrl(publicId: string, width: number): string {
  configure()
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: 'image',
    format: 'jpg',
    transformation: [{ width, crop: 'limit' }, { quality: 'auto:good' }],
  })
}

function configure() {
  cloudinary.config({
    secure: true,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
}
