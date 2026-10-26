import { describe, expect, test } from 'bun:test'
import { INSTITUTIONS, type InstitutionSpec, type KbChunk } from '@sps/shared'
import type { PolicyRetriever } from '@sps/retrieval'
import type { LanguageModel } from 'ai'
import { PolicyOrchestrator } from './orchestrator'

const PROVISION =
  'Tout traitement de données de santé doit être autorisé par la personne concernée et déclaré à l’autorité de protection des données.'

const chunk: KbChunk = {
  id: 'c1',
  filename: 'loi_2024_protection_donnees.pdf',
  text: PROVISION,
  chunkIndex: 0,
  country: 'cm',
  jurisdiction: 'national',
  docType: 'law',
  articleNumber: '12',
  headingPath: 'TITRE I > ARTICLE 12',
  isActive: true,
}

/** A real registry entry, so the prompt is built exactly as in production. */
const institution: InstitutionSpec =
  INSTITUTIONS.find((i) => i.id === 'data_protection_authority') ?? INSTITUTIONS[0]!

const retriever = {
  search: async () => [chunk],
} as unknown as PolicyRetriever

/** A model that replays prepared answers, one per call. */
function scriptedModel(answers: string[]): { model: LanguageModel; calls: () => number } {
  let calls = 0
  const model = {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'test-model',
    supportedUrls: {},
    doGenerate: async () => {
      const text = answers[Math.min(calls, answers.length - 1)] ?? ''
      calls += 1
      return {
        content: [{ type: 'text', text }],
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        warnings: [],
      }
    },
    doStream: async () => {
      throw new Error('not used')
    },
  }
  return { model: model as unknown as LanguageModel, calls: () => calls }
}

const baseInput = {
  institution,
  question: 'Is the hospital’s processing lawful?',
  country: 'cm',
  domain: 'health' as const,
  lens: 'simulation' as const,
}

describe('citation validator in the agent loop', () => {
  test('a fabricated quote is rejected and the agent answers again', async () => {
    const { model, calls } = scriptedModel([
      // attempt 1: invents a provision that is not in the corpus
      'Under loi_2024_protection_donnees.pdf · ARTICLE 12, “le traitement des données de santé est interdit en toutes circonstances sans exception” — the hospital is therefore unlawful.',
      // attempt 2: quotes the actual text
      `Under loi_2024_protection_donnees.pdf · ARTICLE 12, “${PROVISION}” — consent is required.`,
    ])

    const orchestrator = new PolicyOrchestrator({ model, retriever })
    const assessment = await orchestrator.runAgent({ ...baseInput, maxAttempts: 2 })

    expect(calls()).toBe(2)
    expect(assessment.validation?.ok).toBe(true)
    expect(assessment.validation?.attempts).toBe(2)
    expect(assessment.validation?.rejected).toEqual([])
    expect(assessment.findings[0]).not.toContain('interdit en toutes circonstances')
    expect(assessment.gaps).toHaveLength(0)
    expect(assessment.confidence).toBeGreaterThan(0.8)
  })

  test('when the retry budget is exhausted the gap is reported, not the claim', async () => {
    const fabricated = 'Under ARTICLE 12, “le traitement des données de santé est interdit en toutes circonstances” — unlawful.'
    const { model, calls } = scriptedModel([fabricated, fabricated])

    const orchestrator = new PolicyOrchestrator({ model, retriever })
    const assessment = await orchestrator.runAgent({ ...baseInput, maxAttempts: 2 })

    expect(calls()).toBe(2)
    expect(assessment.validation?.ok).toBe(false)
    expect(assessment.validation?.rejected).toHaveLength(1)
    expect(assessment.gaps).toHaveLength(1)
    expect(assessment.gaps[0]?.severity).toBe('high')
    expect(assessment.confidence).toBeLessThan(0.5)
  })

  test('an answer that cites nothing is rejected', async () => {
    const { model, calls } = scriptedModel(['The processing seems fine.'])
    const orchestrator = new PolicyOrchestrator({ model, retriever })
    const assessment = await orchestrator.runAgent({ ...baseInput, maxAttempts: 1 })

    expect(calls()).toBe(1)
    expect(assessment.validation?.ok).toBe(false)
    expect(assessment.validation?.used).toHaveLength(0)
  })
})
