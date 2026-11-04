/**
 * The media picker's library: every image this conversation already stored.
 *
 * Chat images live in MinIO / S3 or Cloudinary and a turn only keeps their
 * reference. Re-attaching one does not upload it again: the picker offers the
 * references the conversation already holds, so the operator can reuse an image
 * without a second transfer.
 */
import type { TurnAttachment } from '@/components/ai/display/chat-message'
import type { AttachmentRefDto } from './api'

/**
 * A turn attachment as a stored reference. Legacy turns keep a `data:` URL and
 * no id: those bytes are gone from the store, so they are not re-attachable.
 */
export function storedRefFromTurn(attachment: TurnAttachment): AttachmentRefDto | null {
  if (!attachment.id || !attachment.url || attachment.url.startsWith('data:') || attachment.url.startsWith('blob:')) {
    return null
  }
  return {
    id: attachment.id,
    provider: attachment.provider ?? 's3',
    mime: attachment.mime ?? 'image/png',
    name: attachment.name ?? 'image',
    size: attachment.size ?? 0,
    ...(attachment.width ? { width: attachment.width } : {}),
    ...(attachment.height ? { height: attachment.height } : {}),
    ...(attachment.sha256 ? { sha256: attachment.sha256 } : {}),
    url: attachment.url,
    thumbnailUrl: attachment.thumbnailUrl ?? attachment.url,
  }
}

/**
 * The library of the conversation, newest first and deduplicated by id.
 * `extra` carries what the composer holds right now (a pending pick may not be
 * on a turn yet), then the turns are read newest to oldest.
 */
export function galleryRefs(
  turns: Array<{ attachments?: TurnAttachment[] }>,
  extra: AttachmentRefDto[] = [],
): AttachmentRefDto[] {
  const seen = new Set<string>()
  const images: AttachmentRefDto[] = []
  const push = (ref: AttachmentRefDto | null) => {
    if (!ref || seen.has(ref.id)) return
    seen.add(ref.id)
    images.push(ref)
  }

  extra.forEach(push)
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    for (const attachment of turns[index]?.attachments ?? []) push(storedRefFromTurn(attachment))
  }
  return images
}
