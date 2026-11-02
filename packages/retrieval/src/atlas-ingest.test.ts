import { describe, expect, test } from 'bun:test'
import { RightsBlockedError } from '@sps/shared'
import { AtlasIngestor } from './atlas-ingest'

function ingestor() {
  return new AtlasIngestor({
    mongodbUri: 'mongodb://127.0.0.1:1',
    dbName: 'test',
    searchMode: 'text',
  })
}

const base = {
  text: 'Article 1. A sufficiently long body of text for the chunker to accept.',
  filename: 'document.txt',
  country: 'cm',
}

describe('Atlas ingestion rights gate', () => {
  test('refuses a quotation-only payload before touching the database', async () => {
    await expect(ingestor().ingest({ ...base, rights: 'quotation-only' })).rejects.toBeInstanceOf(RightsBlockedError)
  })

  test('refuses a to-confirm payload', async () => {
    await expect(ingestor().ingest({ ...base, rights: 'to-confirm' })).rejects.toThrow(/rights=to-confirm/)
  })

  test('refuses a payload with no rights at all', async () => {
    await expect(
      ingestor().ingest({ ...base, rights: undefined as never }),
    ).rejects.toThrow(/rights=to-confirm/)
  })
})
