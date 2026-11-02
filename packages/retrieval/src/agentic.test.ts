import { describe, expect, test } from 'bun:test'
import type { KbChunk } from '@sps/shared'
import { AgenticRetriever, extractJson, type LexicalSource, type Think } from './agentic'

function chunk(id: string, text: string, extra: Partial<KbChunk> = {}): KbChunk {
  return {
    id,
    filename: extra.filename ?? 'loi_2024_protection_donnees.pdf',
    text,
    chunkIndex: Number(id.replace(/\D/g, '')) || 0,
    country: 'CM',
    jurisdiction: 'national',
    docType: 'law',
    isActive: true,
    ...extra,
  } as KbChunk
}

const CORPUS = [
  chunk('c1', 'Le responsable du traitement notifie la violation de données à l’Autorité', { articleNumber: '41' }),
  chunk('c2', 'La notification intervient dans un délai de soixante-douze heures', { articleNumber: '41' }),
  chunk('c3', 'Les données de santé sont des données sensibles', { articleNumber: '12' }),
  chunk('c4', 'Stratégie nationale de santé numérique', { filename: 'psnsn.pdf', docType: 'strategy' }),
]

/** Lexical stand-in: a passage matches when it contains one word of the query (4 letters or more). */
function source(log: string[] = []): LexicalSource {
  return {
    async lexical(text, limit) {
      log.push(text)
      const words = text.toLowerCase().split(/\s+/).filter((word) => word.length >= 4)
      return CORPUS.filter((item) => words.some((word) => item.text.toLowerCase().includes(word))).slice(0, limit)
    },
    async article(filename, articleNumber) {
      return CORPUS.filter((item) => item.filename === filename && item.articleNumber === articleNumber)
    },
  }
}

/** Scripted model: answers by prompt kind and records every call. */
function model(answers: { plan?: string; judge?: string[]; rerank?: string }, calls: string[]): Think {
  const judges = [...(answers.judge ?? [])]
  return async (prompt) => {
    if (prompt.startsWith('You plan')) {
      calls.push('plan')
      return answers.plan ?? '{"subQuestions":[]}'
    }
    if (prompt.startsWith('You check')) {
      calls.push('judge')
      return judges.shift() ?? '{"sufficient":true}'
    }
    calls.push('rerank')
    return answers.rerank ?? '{"ranking":[]}'
  }
}

const QUERY = { text: 'délai de notification violation données santé', country: 'CM' }

describe('agentic retrieval', () => {
  test('without a model the search is lexical and makes no model call', async () => {
    const retriever = new AgenticRetriever({ source: source() })
    const exploration = await retriever.explore({ ...QUERY, depth: 'deep' })
    expect(exploration.depth).toBe('lexical')
    expect(exploration.stages.final.length).toBeGreaterThan(0)
    expect(exploration.plan).toEqual([])
  })

  test('fast: one plan, one sub-agent, one round, one rerank', async () => {
    const calls: string[] = []
    const retriever = new AgenticRetriever({
      source: source(),
      think: model(
        {
          plan: '{"subQuestions":[{"question":"délai","queries":["délai notification violation"],"articles":["41"]}]}',
          rerank: '```json\n{"ranking":[{"n":2,"score":0.9},{"n":1,"score":0.4}]}\n```',
        },
        calls,
      ),
      modelLabel: () => 'muse-spark-1.3',
    })
    const exploration = await retriever.explore({ ...QUERY, depth: 'fast', topK: 3 })
    expect(calls).toEqual(['plan', 'rerank'])
    expect(exploration.model).toBe('muse-spark-1.3')
    expect(exploration.subAgents).toHaveLength(1)
    expect(exploration.subAgents[0]!.rounds).toHaveLength(1)
    expect(exploration.stages.reranked[0]!.score).toBe(0.9)
    expect(exploration.stages.final).toHaveLength(3)
  })

  test('deep: parallel sub-agents loop with refined queries until the judge is satisfied', async () => {
    const calls: string[] = []
    const log: string[] = []
    const retriever = new AgenticRetriever({
      source: source(log),
      think: model(
        {
          plan: JSON.stringify({
            subQuestions: [
              { question: 'Quel délai ?', queries: ['délai'] },
              { question: 'Quelles données ?', queries: ['données sensibles'] },
            ],
          }),
          judge: ['{"sufficient":false,"queries":["notification soixante-douze heures"]}', '{"sufficient":true}'],
          rerank: '{"ranking":[{"n":1,"score":0.8}]}',
        },
        calls,
      ),
    })
    const exploration = await retriever.explore({ ...QUERY, depth: 'deep' })
    expect(exploration.subAgents).toHaveLength(2)
    expect(calls.filter((call) => call === 'judge')).toHaveLength(2)
    expect(log).toContain('notification soixante-douze heures')
    expect(exploration.subAgents.some((agent) => agent.rounds.length === 2)).toBe(true)
  })

  test('a failing model falls back to the lexical order, never to an empty result', async () => {
    const retriever = new AgenticRetriever({
      source: source(),
      think: async () => {
        throw new Error('upstream 503')
      },
    })
    const exploration = await retriever.explore({ ...QUERY, depth: 'fast' })
    expect(exploration.fallbacks.length).toBeGreaterThan(0)
    expect(exploration.stages.final.length).toBeGreaterThan(0)
  })

  test('a ranking that names unknown passages is ignored', async () => {
    const calls: string[] = []
    const retriever = new AgenticRetriever({
      source: source(),
      think: model({ rerank: '{"ranking":[{"n":99,"score":1},{"n":0,"score":1}]}' }, calls),
    })
    const exploration = await retriever.explore({ ...QUERY, depth: 'fast' })
    expect(exploration.stages.reranked).toEqual([])
    expect(exploration.stages.final.length).toBeGreaterThan(0)
  })

  test('the same question is answered from the cache', async () => {
    const calls: string[] = []
    const retriever = new AgenticRetriever({ source: source(), think: model({}, calls) })
    await retriever.search({ ...QUERY, depth: 'fast' })
    const before = calls.length
    const again = await retriever.search({ ...QUERY, depth: 'fast' })
    expect(calls.length).toBe(before)
    expect(again.length).toBeGreaterThan(0)
  })

  test('sub-agents and rounds are bounded', async () => {
    const calls: string[] = []
    const many = Array.from({ length: 8 }, (_, index) => ({ question: `q${index}`, queries: [`données ${index}`] }))
    const retriever = new AgenticRetriever({
      source: source(),
      maxSubAgents: 3,
      maxRounds: 2,
      think: model(
        {
          plan: JSON.stringify({ subQuestions: many }),
          judge: Array.from({ length: 20 }, (_, index) => `{"sufficient":false,"queries":["santé ${index}"]}`),
        },
        calls,
      ),
    })
    const exploration = await retriever.explore({ ...QUERY, depth: 'deep' })
    expect(exploration.subAgents).toHaveLength(3)
    expect(exploration.subAgents.every((agent) => agent.rounds.length <= 2)).toBe(true)
  })

  test('JSON is found in a fenced or chatty answer', () => {
    expect(extractJson('Sure:\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('{"b":2} done')).toEqual({ b: 2 })
    expect(extractJson('no json here')).toBeNull()
  })
})
