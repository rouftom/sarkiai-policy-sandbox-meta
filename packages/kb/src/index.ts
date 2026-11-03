/**
 * Knowledge-base domain logic: owns the country/jurisdiction taxonomy contract
 * and the typed ingestion request the API and its clients share.
 */

import type { CorpusRights, DocType, Jurisdiction, ReadinessDimension, Taxonomy } from '@sps/shared'

export * from './chunk'

export interface IngestTextInput extends Taxonomy {
  text: string
  filename: string
  /** Reuse rights from the corpus manifest; the API refuses non-publishable ones. */
  rights: CorpusRights
  sourceUrl?: string
  organizationId?: string
}

export const DEFAULT_PILLARS: ReadinessDimension[] = ['data_marketplace', 'ai_policies']

export type { DocType, Jurisdiction, Taxonomy }
