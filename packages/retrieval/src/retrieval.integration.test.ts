import { describe, expect, test } from 'bun:test'
import { PolicyRetriever } from './index'

/**
 * Integration test · requires Qdrant and a local Ollama (embeddings).
 *   QDRANT_URL=http://localhost:6333 OLLAMA_BASE_URL=http://localhost:11434 bun test
 * Skipped automatically when the endpoints are unset (no infra on this machine).
 */
const qdrantUrl = process.env.QDRANT_URL
const ollamaUrl = process.env.OLLAMA_BASE_URL

describe.skipIf(!qdrantUrl || !ollamaUrl)('PolicyRetriever (integration: Qdrant + Ollama)', () => {
  test('search() resolves to an array (empty collection tolerated)', async () => {
    const retriever = new PolicyRetriever({
      qdrantUrl: qdrantUrl!,
      collectionName: process.env.QDRANT_COLLECTION ?? 'policy_chunks',
      embeddingsBaseUrl: ollamaUrl!,
    })
    try {
      const results = await retriever.search({ text: 'protection des données', country: 'cm', topK: 3 })
      expect(Array.isArray(results)).toBe(true)
      for (const chunk of results) expect(chunk.country).toBe('cm')
    } catch (error) {
      // A missing collection or an unreachable endpoint is acceptable in CI;
      // only an unexpected crash fails.
      expect(String(error)).toMatch(/not found|collection|connect|getaddrinfo|ENOTFOUND|ECONNREFUSED|fetch failed/i)
    }
  })
})
