/**
 * Corpus reuse rights · the ingestion gate.
 *
 * A document's `rights` field comes from its corpus manifest (under
 * `data/country/` and `data/global/`) and is the only thing that decides whether the
 * full text may enter the knowledge base. The policy is written in
 * `docs/LICENSING.md`; this module makes it executable.
 *
 * Failing closed matters more than convenience: a document whose rights are
 * unknown, misspelled or missing is treated as `to-confirm` and refused, so a
 * new ingestion path cannot silently reintroduce a restricted payload.
 */

import { z } from 'zod'
import type { CorpusRights } from './types'

export const CORPUS_RIGHTS = ['official-text', 'open-licence', 'quotation-only', 'to-confirm'] as const

/** The buckets whose full text may be stored and served. */
export const PUBLISHABLE_RIGHTS = ['official-text', 'open-licence'] as const

/** Zod schema for API request bodies. */
export const corpusRightsSchema = z.enum(CORPUS_RIGHTS)

/** The bucket a value falls into; anything unrecognised is `to-confirm`. */
export function normalizeCorpusRights(value: unknown): CorpusRights {
  return typeof value === 'string' && (CORPUS_RIGHTS as readonly string[]).includes(value)
    ? (value as CorpusRights)
    : 'to-confirm'
}

/** Whether the full text of a document with these rights may be ingested. */
export function isPublishableRights(value: unknown): boolean {
  const rights = normalizeCorpusRights(value)
  return (PUBLISHABLE_RIGHTS as readonly CorpusRights[]).includes(rights)
}

export const RIGHTS_BLOCKED_MESSAGE =
  'Document rights do not allow full-text ingestion. ' +
  'Only official-text and open-licence documents may enter the knowledge base; ' +
  'quotation-only and to-confirm documents must stay out (see docs/LICENSING.md).'

/** Thrown by every ingestion path when the rights do not permit storage. */
export class RightsBlockedError extends Error {
  constructor(
    readonly rights: CorpusRights,
    readonly filename?: string,
  ) {
    super(
      `${RIGHTS_BLOCKED_MESSAGE} rights=${rights}${filename ? ` filename=${filename}` : ''}`,
    )
    this.name = 'RightsBlockedError'
  }
}

/**
 * Assert that the payload may be stored, returning the normalised bucket.
 * Missing or unknown rights are refused rather than defaulted to a permissive
 * value.
 */
export function assertPublishableRights(value: unknown, filename?: string): CorpusRights {
  const rights = normalizeCorpusRights(value)
  if (!isPublishableRights(rights)) throw new RightsBlockedError(rights, filename)
  return rights
}
