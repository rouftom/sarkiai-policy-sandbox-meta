import { describe, expect, test } from 'bun:test'
import { INSTITUTIONS, type InstitutionSpec, type KbChunk } from '@sps/shared'
import type { Retriever } from '@sps/retrieval'
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
} as unknown as Retriever

/** A model that replays prepared answers, one per call, buffered or streamed. */
function scriptedModel(answers: string[]): { model: LanguageModel; calls: () => number } {
  let calls = 0
  const next = () => {
    const text = answers[Math.min(calls, answers.length - 1)] ?? ''
    calls += 1
    return text
  }
  const model = {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'test-model',
    supportedUrls: {},
    doGenerate: async () => {
      const text = next()
      return {
        content: [{ type: 'text', text }],
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        warnings: [],
      }
    },
    // Same answer, three deltas: enough to prove the orchestrator forwards the
    // stream rather than buffering it before the first event.
    doStream: async () => {
      const text = next()
      const third = Math.ceil(text.length / 3)
      const pieces = [text.slice(0, third), text.slice(third, third * 2), text.slice(third * 2)]
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] })
            controller.enqueue({ type: 'text-start', id: 't1' })
            for (const delta of pieces) {
              if (delta) controller.enqueue({ type: 'text-delta', id: 't1', delta })
            }
            controller.enqueue({ type: 'text-end', id: 't1' })
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
            })
            controller.close()
          },
        }),
      }
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

describe('streamed answers', () => {
  const valid = `Under loi_2024_protection_donnees.pdf · ARTICLE 12, “${PROVISION}” — consent is required.`

  test('forwards the deltas and the same assessment the buffered route returns', async () => {
    const { model } = scriptedModel([valid])
    const orchestrator = new PolicyOrchestrator({ model, retriever })
    const stages: string[] = []
    let streamed = ''

    const assessment = await orchestrator.streamAgent(baseInput, {
      onStage: (stage) => stages.push(stage),
      onDelta: (text) => {
        streamed += text
      },
    })

    expect(stages).toEqual(['retrieving', 'generating', 'validating', 'persisting'])
    // Deltas concatenate to exactly the answer the assessment carries.
    expect(streamed).toBe(valid)
    expect(streamed).toBe(assessment.findings[0]!)
    expect(assessment.validation?.ok).toBe(true)
  })

  test('forwards the reasoning as it is written, before the answer text', async () => {
    const reasoning = 'The quote must be checked against article 12 before it is cited.'
    const model = {
      specificationVersion: 'v3',
      provider: 'test',
      modelId: 'test-reasoning',
      supportedUrls: {},
      doGenerate: async () => {
        throw new Error('buffered path not expected')
      },
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] })
            controller.enqueue({ type: 'reasoning-start', id: 'r1' })
            for (const delta of [reasoning.slice(0, 20), reasoning.slice(20)]) {
              controller.enqueue({ type: 'reasoning-delta', id: 'r1', delta })
            }
            controller.enqueue({ type: 'reasoning-end', id: 'r1' })
            controller.enqueue({ type: 'text-start', id: 't1' })
            controller.enqueue({ type: 'text-delta', id: 't1', delta: valid })
            controller.enqueue({ type: 'text-end', id: 't1' })
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
            })
            controller.close()
          },
        }),
      }),
    }
    const orchestrator = new PolicyOrchestrator({ model: model as unknown as LanguageModel, retriever })
    const events: string[] = []
    let thought = ''

    await orchestrator.streamAgent(baseInput, {
      onDelta: () => events.push('text'),
      onReasoning: (text) => {
        thought += text
        if (events[events.length - 1] !== 'reasoning') events.push('reasoning')
      },
    })

    expect(thought).toBe(reasoning)
    expect(events[0]).toBe('reasoning')
    expect(events).toContain('text')
  })

  test('a rejected draft emits `retry` so the client can clear it', async () => {
    const fabricated = 'Under ARTICLE 12, “le traitement des données de santé est interdit en toutes circonstances” — unlawful.'
    const { model, calls } = scriptedModel([fabricated, valid])
    const orchestrator = new PolicyOrchestrator({ model, retriever })
    const stages: string[] = []
    const drafts: string[] = []
    let current = ''

    await orchestrator.streamAgent({ ...baseInput, maxAttempts: 2 }, {
      onStage: (stage) => {
        stages.push(stage)
        // Mirror the console: a retry discards what was written so far.
        if (stage === 'retry') {
          drafts.push(current)
          current = ''
        }
      },
      onDelta: (text) => {
        current += text
      },
    })

    expect(calls()).toBe(2)
    expect(stages.filter((stage) => stage === 'generating')).toHaveLength(2)
    expect(stages).toContain('retry')
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toContain('interdit en toutes circonstances')
    expect(current).toBe(valid)
  })
})
