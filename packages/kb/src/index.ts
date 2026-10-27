/**
 * Knowledge-base domain logic: talks to the Python ingestion service and owns
 * the country/jurisdiction taxonomy contract.
 */

import type { DocType, Jurisdiction, ReadinessDimension, Taxonomy } from '@sps/shared'

export * from './chunk'

export interface IngestionConfig {
  baseUrl: string
  apiKey?: string
}

export interface IngestFileInput extends Taxonomy {
  /** Absolute path or a Blob/File when running in a browser/runtime with FormData. */
  content: Blob
  filename: string
  sourceUrl?: string
  organizationId?: string
}

export interface IngestTextInput extends Taxonomy {
  text: string
  filename: string
  sourceUrl?: string
  organizationId?: string
}

export interface IngestResult {
  success: boolean
  filename?: string
  country?: string
  docType?: string
  chunksProcessed: number
  chunksInserted: number
  chunksSkipped: number
  usedOcr: boolean
}

export class IngestionClient {
  constructor(private readonly config: IngestionConfig) {}

  private headers(json = true): HeadersInit {
    const headers: Record<string, string> = {}
    if (json) headers['Content-Type'] = 'application/json'
    if (this.config.apiKey) headers['X-API-Key'] = this.config.apiKey
    return headers
  }

  async ingestText(input: IngestTextInput): Promise<IngestResult> {
    const response = await fetch(`${this.config.baseUrl}/v1/ingest/text`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        text: input.text,
        filename: input.filename,
        country: input.country,
        jurisdiction: input.jurisdiction,
        docType: input.docType,
        pillar: input.pillar,
        namespace: input.namespace,
        version: input.version,
        sourceUrl: input.sourceUrl,
        organizationId: input.organizationId,
      }),
    })
    if (!response.ok) throw new Error(`Ingestion failed (${response.status}): ${await response.text()}`)
    return (await response.json()) as IngestResult
  }

  async ingestFile(input: IngestFileInput): Promise<IngestResult> {
    const form = new FormData()
    form.append('file', input.content, input.filename)
    form.append('country', input.country)
    form.append('jurisdiction', input.jurisdiction)
    form.append('docType', input.docType)
    if (input.namespace) form.append('namespace', input.namespace)
    if (input.version) form.append('version', input.version)
    if (input.sourceUrl) form.append('sourceUrl', input.sourceUrl)

    const response = await fetch(`${this.config.baseUrl}/v1/ingest/file`, {
      method: 'POST',
      headers: this.headers(false),
      body: form,
    })
    if (!response.ok) throw new Error(`Ingestion failed (${response.status}): ${await response.text()}`)
    return (await response.json()) as IngestResult
  }
}

export const DEFAULT_PILLARS: ReadinessDimension[] = ['data_marketplace', 'ai_policies']

export type { DocType, Jurisdiction, Taxonomy }
