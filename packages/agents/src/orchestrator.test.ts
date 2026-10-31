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
      'Under loi_2024_protection_donnees.pdf · ARTICLE 12, “le traitement des données de santé est interdit en toutes circonstances sans exception” · the hospital is therefore unlawful.',
      // attempt 2: quotes the actual text
      `Under loi_2024_protection_donnees.pdf · ARTICLE 12, “${PROVISION}” · consent is required.`,
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
    const fabricated = 'Under ARTICLE 12, “le traitement des données de santé est interdit en toutes circonstances” · unlawful.'
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
  const valid = `Under loi_2024_protection_donnees.pdf · ARTICLE 12, “${PROVISION}” · consent is required.`

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
    const fabricated = 'Under ARTICLE 12, “le traitement des données de santé est interdit en toutes circonstances” · unlawful.'
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

describe('tool calls the SDK dropped', () => {
  const valid = `Under loi_2024_protection_donnees.pdf · ARTICLE 12, “${PROVISION}” · consent is required.`

  /**
   * Some providers end a streamed step with a finish reason the SDK does not
   * accept for tool execution (`stop` / `tool-calls`), and the SDK then drops
   * the call: the turn used to stop on the preamble. The orchestrator runs the
   * call itself and answers from its results in the same turn.
   */
  function droppedToolModel(preamble: string): { model: LanguageModel; calls: () => number; prompts: string[] } {
    let calls = 0
    const prompts: string[] = []
    const model = {
      specificationVersion: 'v3',
      provider: 'test',
      modelId: 'test-dropped-tools',
      supportedUrls: {},
      doGenerate: async () => {
        throw new Error('buffered path not expected')
      },
      doStream: async (options: { prompt?: Array<{ content: unknown }> }) => {
        const last = options.prompt?.[options.prompt.length - 1]
        prompts.push(JSON.stringify(last?.content ?? ''))
        const first = calls === 0
        calls += 1
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'stream-start', warnings: [] })
              controller.enqueue({ type: 'text-start', id: 't1' })
              controller.enqueue({ type: 'text-delta', id: 't1', delta: first ? preamble : valid })
              controller.enqueue({ type: 'text-end', id: 't1' })
              if (first) {
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: 'call_dropped',
                  toolName: 'search_corpus',
                  input: JSON.stringify({ query: 'health data breach notification' }),
                })
              }
              controller.enqueue({
                type: 'finish',
                // Not `stop` / `tool-calls`: the SDK refuses to execute the call.
                finishReason: first ? 'other' : 'stop',
                usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
              })
              controller.close()
            },
          }),
        }
      },
    }
    return { model: model as unknown as LanguageModel, calls: () => calls, prompts }
  }

  test('the orchestrator runs the call and answers from its result', async () => {
    const preamble = 'I am locating the provision that governs health data breach notification.'
    const { model, prompts } = droppedToolModel(preamble)
    const searched: string[] = []
    const counting = {
      search: async (query: { text: string }) => {
        searched.push(query.text)
        return [chunk]
      },
    } as unknown as Retriever
    const orchestrator = new PolicyOrchestrator({ model, retriever: counting })
    const toolEvents: string[] = []

    const assessment = await orchestrator.streamAgent(
      { ...baseInput, withTools: true },
      { onDelta: () => undefined, onTool: (event) => toolEvents.push(`${event.phase}:${event.name}`) },
    )

    // The dropped search really ran, once, with the arguments the model chose.
    expect(searched).toEqual(['health data breach notification'])
    // A second generation answered without tools, from the tool block.
    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toContain('health data breach notification')
    expect(prompts[1]).toContain('already ran')
    // The announcement is replaced by the grounded answer.
    expect(assessment.findings[0]).toBe(valid)
    expect(assessment.findings[0]).not.toBe(preamble)
    expect(assessment.validation?.ok).toBe(true)
    expect(assessment.citations).toHaveLength(1)
    // The trail is closed: the tool step gets its `end` event even though the SDK skipped it.
    expect(toolEvents).toEqual(['start:search_corpus', 'end:search_corpus'])
  })

  test('an operator card ends the turn without inventing an answer', async () => {
    const model = {
      specificationVersion: 'v3',
      provider: 'test',
      modelId: 'test-ask-user',
      supportedUrls: {},
      doGenerate: async () => {
        throw new Error('buffered path not expected')
      },
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] })
            controller.enqueue({
              type: 'tool-call',
              toolCallId: 'call_ask',
              toolName: 'ask_user',
              input: JSON.stringify({ question: 'Which sector are you asking about?' }),
            })
            controller.enqueue({
              type: 'finish',
              finishReason: 'other',
              usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
            })
            controller.close()
          },
        }),
      }),
    }
    const orchestrator = new PolicyOrchestrator({ model: model as unknown as LanguageModel, retriever })
    const cards: string[] = []

    const assessment = await orchestrator.streamAgent(
      { ...baseInput, withTools: true },
      { onDelta: () => undefined, onUi: (ui) => cards.push(ui.kind) },
    )

    expect(cards).toEqual(['ask_user'])
    expect(assessment.findings[0]).toBe('')
  })
})
