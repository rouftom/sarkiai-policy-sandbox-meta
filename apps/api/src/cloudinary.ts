/**
 * Media uploads to Cloudinary, in the hackathon's own namespace (a folder of the
 * account). Configured by the same variables as the organization app:
 * CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, and
 * CLOUDINARY_SPS_FOLDER for the namespace (default `sarkiai-hackathon`).
 *
 * When Cloudinary is not configured, uploads return null and the caller falls
 * back to a self-contained rendering. Secrets are never logged.
 */
import { v2 as cloudinary } from 'cloudinary'

export const HACKATHON_FOLDER = process.env.CLOUDINARY_SPS_FOLDER || 'sarkiai-hackathon'

export function cloudinaryConfigured(): boolean {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
}

export interface UploadedImage {
  url: string
  publicId: string
}

/** Uploads an image (a data URI) and returns its public HTTPS address and id, or null. */
export async function uploadImage(source: string, publicId: string): Promise<UploadedImage | null> {
  if (!cloudinaryConfigured()) return null
  configure()
  try {
    const result = await cloudinary.uploader.upload(source, {
      folder: HACKATHON_FOLDER,
      public_id: publicId,
      overwrite: true,
      resource_type: 'image',
    })
    return { url: result.secure_url, publicId: result.public_id }
  } catch (error) {
    console.error('Cloudinary upload failed:', (error as Error).message)
    return null
  }
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
