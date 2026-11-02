/**
 * Agentic retrieval: every model call is a Meta model.
 *
 * The corpus is small, structured (instrument → article) and rich in exact
 * legal terms, so it is searched lexically (BM25, a scoring formula, no model)
 * and the reasoning is done by the Meta model of the deployment mode:
 *
 *   plan    the model splits the question into sub-questions, each with short
 *           legal queries (French and English terms, likely instruments);
 *   search  one sub-agent per sub-question runs the queries, fuses the lists
 *           (reciprocal rank fusion) and reads the neighbouring passages of the
 *           article it found;
 *   judge   in `deep` mode the sub-agent asks the model whether the passages
 *           answer its sub-question, and loops with refined queries;
 *   rerank  one listwise call orders the merged candidates.
 *
 * Depths: `lexical` (no model call), `fast` (plan + rerank, one sub-agent, one
 * round), `deep` (parallel sub-agents, judge loops). Every model step is
 * bounded (sub-agents, rounds, output tokens, timeout) and falls back to the
 * lexical order, so an agent never waits on a failed call. The citation
 * validator stays the last filter downstream.
 */

import type { KbChunk, RetrievalDepth, RetrievalQuery } from '@sps/shared'
import type { Retriever } from './types'

/** Lexical access to the corpus. Implemented on MongoDB Atlas Search or a MongoDB text index. */
export interface LexicalSource {
  lexical(text: string, limit: number, filter: Record<string, string | boolean>): Promise<KbChunk[]>
  /** Passages of one article of one instrument, in reading order. */
  article?(filename: string, articleNumber: string, limit: number): Promise<KbChunk[]>
  /** Attaches the figures of each passage's document. */
  withImages?(chunks: KbChunk[]): Promise<KbChunk[]>
  close?(): Promise<void>
}

/** One completion from the Meta model of the current mode. */
export type Think = (prompt: string, options?: { maxOutputTokens?: number }) => Promise<string>

export interface AgenticRetrieverConfig {
  source: LexicalSource
  /** The Meta model of the current mode. Without it every search is lexical. */
  think?: Think
  /** Model id shown in explorations and traces. */
  modelLabel?: () => string
  defaultDepth?: RetrievalDepth
  maxSubAgents?: number
  maxRounds?: number
  queriesPerAgent?: number
  candidatesPerQuery?: number
  rerankPool?: number
  stepTimeoutMs?: number
  /**
   * Output budget for one model step. Muse Spark counts its reasoning tokens
   * against it: below roughly 2 000 the answer is empty and the step falls back
   * to the lexical order, so the default leaves room for the reasoning and the
   * JSON that follows.
   */
  modelStepTokens?: number
  cacheTtlMs?: number
  cacheSize?: number
}

export interface PlannedSubQuestion {
  question: string
  queries: string[]
  articles: string[]
}

export interface SubAgentRound {
  queries: string[]
  hits: number
  sufficient?: boolean
}

export interface SubAgentTrace {
  question: string
  rounds: SubAgentRound[]
}

export interface AgenticStageItem {
  id: string
  rank: number
  score?: number
  filename: string
  text: string
  chunkIndex: number
  country: string
  jurisdiction: string
  docType: string
  headingPath?: string
  articleNumber?: string
  sourceUrl?: string
}

export interface AgenticExploration {
  query: string
  filter: Record<string, string | boolean>
  topK: number
  depth: RetrievalDepth
  model: string
  plan: PlannedSubQuestion[]
  subAgents: SubAgentTrace[]
  stages: {
    lexical: AgenticStageItem[]
    fused: AgenticStageItem[]
    reranked: AgenticStageItem[]
    final: AgenticStageItem[]
  }
  timings: { planMs: number; searchMs: number; judgeMs: number; rerankMs: number; totalMs: number }
  /** Model steps that failed and fell back to the lexical order. */
  fallbacks: string[]
}

const DEFAULTS = {
  defaultDepth: 'fast' as RetrievalDepth,
  maxSubAgents: 3,
  maxRounds: 2,
  queriesPerAgent: 4,
  candidatesPerQuery: 12,
  rerankPool: 20,
  stepTimeoutMs: 25_000,
  modelStepTokens: 4_000,
  cacheTtlMs: 30 * 60_000,
  cacheSize: 500,
}

/** Exact-match filter on the corpus taxonomy; only active passages are searched. */
export function corpusFilter(query: RetrievalQuery): Record<string, string | boolean> {
  const filter: Record<string, string | boolean> = { isActive: true }
  if (query.country) filter.country = query.country
  if (query.jurisdiction) filter.jurisdiction = query.jurisdiction
  if (query.docType) filter.docType = query.docType
  if (query.namespace) filter.namespace = query.namespace
  return filter
}

/** Reciprocal rank fusion keyed by passage id. */
export function fuseRanked<T extends { id: string }>(
  lists: Array<{ items: T[]; weight: number }>,
  k = 60,
): Array<T & { score: number }> {
  const scores = new Map<string, { item: T; score: number }>()
  for (const { items, weight } of lists) {
    items.forEach((item, index) => {
      const current = scores.get(item.id) ?? { item, score: 0 }
      current.score += weight / (k + index + 1)
      scores.set(item.id, current)
    })
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).map(({ item, score }) => ({ ...item, score }))
}

/** First JSON object in a model answer (fenced or not); null when there is none. */
export function extractJson(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced?.[1] ?? raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(body.slice(start, end + 1))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function strings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.replace(/\s+/g, ' ').trim().slice(0, 160)
    if (trimmed && !out.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) out.push(trimmed)
    if (out.length >= max) break
  }
  return out
}

function snippet(chunk: KbChunk, length: number): string {
  const where = [chunk.filename, chunk.articleNumber ? `art. ${chunk.articleNumber}` : '', chunk.headingPath ?? '']
    .filter(Boolean)
    .join(' · ')
  return `${where}\n${chunk.text.replace(/\s+/g, ' ').slice(0, length)}`
}

function toItem(chunk: KbChunk & { score?: number }, index: number): AgenticStageItem {
  return {
    id: chunk.id,
    rank: index + 1,
    ...(typeof chunk.score === 'number' ? { score: chunk.score } : {}),
    filename: chunk.filename,
    text: chunk.text,
    chunkIndex: chunk.chunkIndex,
    country: chunk.country,
    jurisdiction: chunk.jurisdiction,
    docType: chunk.docType,
    ...(chunk.headingPath ? { headingPath: chunk.headingPath } : {}),
    ...(chunk.articleNumber ? { articleNumber: chunk.articleNumber } : {}),
    ...(chunk.sourceUrl ? { sourceUrl: chunk.sourceUrl } : {}),
  }
}

async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function planPrompt(query: RetrievalQuery, maxSubQuestions: number, maxQueries: number): string {
  return [
    'You plan a search in a corpus of official legal and policy texts (laws, decrees, strategies, treaties).',
    `Country code: ${query.country || 'any'}. Most texts are in French, some in English.`,
    `Split the question into at most ${maxSubQuestions} sub-question(s) that need different passages.`,
    `For each one, write at most ${maxQueries} short keyword queries (3 to 8 words) a full-text index can match:`,
    'the exact legal terms in French, their English equivalent when useful, and the name of a likely instrument.',
    'List article numbers only when you are sure of them. Do not answer the question.',
    'Reply with JSON only: {"subQuestions":[{"question":"...","queries":["..."],"articles":["..."]}]}',
    '',
    `Question: ${query.text}`,
  ].join('\n')
}

export function judgePrompt(question: string, passages: KbChunk[], maxQueries: number): string {
  const numbered = passages.map((chunk, index) => `[${index + 1}] ${snippet(chunk, 300)}`).join('\n\n')
  return [
    'You check whether retrieved legal passages are enough to answer a sub-question.',
    `If they are not, propose at most ${maxQueries} new short keyword queries (3 to 8 words) for a full-text index.`,
    'Reply with JSON only: {"sufficient":true|false,"queries":["..."]}',
    '',
    `Sub-question: ${question}`,
    '',
    numbered || '(no passage found)',
  ].join('\n')
}

export function rerankPrompt(question: string, passages: KbChunk[]): string {
  const numbered = passages.map((chunk, index) => `[${index + 1}] ${snippet(chunk, 400)}`).join('\n\n')
  return [
    'Rank the passages by how directly they answer the question. Prefer binding provisions (law, decree,',
    'regulation) that state an obligation, a deadline, a mandate or a sanction over general context.',
    'Score each relevant passage from 0 to 1 and leave out irrelevant ones.',
    'Reply with JSON only: {"ranking":[{"n":1,"score":0.92}]}',
    '',
    `Question: ${question}`,
    '',
    numbered,
  ].join('\n')
}

interface CacheEntry {
  expires: number
  value: AgenticExploration
}

export class AgenticRetriever implements Retriever {
  private readonly cfg: typeof DEFAULTS
  private readonly cache = new Map<string, CacheEntry>()

  constructor(private readonly config: AgenticRetrieverConfig) {
    this.cfg = {
      defaultDepth: config.defaultDepth ?? DEFAULTS.defaultDepth,
      maxSubAgents: config.maxSubAgents ?? DEFAULTS.maxSubAgents,
      maxRounds: config.maxRounds ?? DEFAULTS.maxRounds,
      queriesPerAgent: config.queriesPerAgent ?? DEFAULTS.queriesPerAgent,
      candidatesPerQuery: config.candidatesPerQuery ?? DEFAULTS.candidatesPerQuery,
      rerankPool: config.rerankPool ?? DEFAULTS.rerankPool,
      stepTimeoutMs: config.stepTimeoutMs ?? DEFAULTS.stepTimeoutMs,
      modelStepTokens: config.modelStepTokens ?? DEFAULTS.modelStepTokens,
      cacheTtlMs: config.cacheTtlMs ?? DEFAULTS.cacheTtlMs,
      cacheSize: config.cacheSize ?? DEFAULTS.cacheSize,
    }
  }

  async search(query: RetrievalQuery): Promise<KbChunk[]> {
    const exploration = await this.explore(query)
    return this.chunksOf(exploration)
  }

  async close(): Promise<void> {
    await this.config.source.close?.()
  }

  private finalChunks = new WeakMap<AgenticExploration, KbChunk[]>()

  private chunksOf(exploration: AgenticExploration): KbChunk[] {
    return this.finalChunks.get(exploration) ?? []
  }

  private model(): string {
    return this.config.modelLabel?.() ?? 'lexical'
  }

  private cacheKey(query: RetrievalQuery, depth: RetrievalDepth): string {
    return JSON.stringify([depth, this.model(), query.country, query.jurisdiction, query.docType, query.namespace, query.topK, query.text.trim().toLowerCase()])
  }

  private async think(prompt: string, label: string, fallbacks: string[], maxOutputTokens: number): Promise<Record<string, unknown> | null> {
    const think = this.config.think
    if (!think) return null
    try {
      const raw = await withTimeout(think(prompt, { maxOutputTokens }), this.cfg.stepTimeoutMs, label)
      const parsed = extractJson(raw)
      if (!parsed) fallbacks.push(`${label}: no JSON in the answer`)
      return parsed
    } catch (error) {
      fallbacks.push(`${label}: ${(error as Error).message}`)
      return null
    }
  }

  private async lexical(text: string, filter: Record<string, string | boolean>, limit: number): Promise<KbChunk[]> {
    try {
      return await this.config.source.lexical(text, limit, filter)
    } catch (error) {
      console.warn(`[retrieval] lexical search failed: ${(error as Error).message}`)
      return []
    }
  }

  /** Passages of the articles the top hits belong to: the provision is read whole. */
  private async expandArticles(hits: KbChunk[], filter: Record<string, string | boolean>): Promise<KbChunk[]> {
    const read = this.config.source.article
    if (!read) return []
    const targets = hits
      .filter((chunk) => chunk.articleNumber)
      .slice(0, 3)
      .map((chunk) => [chunk.filename, chunk.articleNumber!] as const)
    const unique = [...new Map(targets.map((target) => [target.join('#'), target])).values()]
    const lists = await Promise.all(
      unique.map(([filename, article]) => read.call(this.config.source, filename, article, 4).catch(() => [] as KbChunk[])),
    )
    return lists.flat().filter((chunk) => !filter.country || chunk.country === filter.country)
  }

  private async runSubAgent(
    sub: PlannedSubQuestion,
    filter: Record<string, string | boolean>,
    depth: RetrievalDepth,
    fallbacks: string[],
    timings: AgenticExploration['timings'],
  ): Promise<{ trace: SubAgentTrace; fused: Array<KbChunk & { score: number }> }> {
    const trace: SubAgentTrace = { question: sub.question, rounds: [] }
    const lists: Array<{ items: KbChunk[]; weight: number }> = []
    const seen = new Set<string>()
    let queries = sub.queries.length > 0 ? sub.queries : [sub.question]
    const rounds = depth === 'deep' ? this.cfg.maxRounds : 1

    for (let round = 0; round < rounds; round += 1) {
      const fresh = queries.filter((query) => !seen.has(query.toLowerCase()))
      if (fresh.length === 0) break
      fresh.forEach((query) => seen.add(query.toLowerCase()))

      const searchStart = Date.now()
      const results = await Promise.all(fresh.map((query) => this.lexical(query, filter, this.cfg.candidatesPerQuery)))
      results.forEach((items) => lists.push({ items, weight: 1 }))
      const articleHits = sub.articles.length > 0 && round === 0
        ? await Promise.all(sub.articles.map((article) => this.lexical(`article ${article}`, filter, 4)))
        : []
      articleHits.forEach((items) => lists.push({ items: items.filter((chunk) => sub.articles.includes(chunk.articleNumber ?? '')), weight: 0.8 }))
      const fusedSoFar = fuseRanked(lists)
      const neighbours = await this.expandArticles(fusedSoFar, filter)
      if (neighbours.length > 0) lists.push({ items: neighbours, weight: 0.5 })
      timings.searchMs += Date.now() - searchStart

      const roundTrace: SubAgentRound = { queries: fresh, hits: new Set(results.flat().map((chunk) => chunk.id)).size }
      trace.rounds.push(roundTrace)

      if (depth !== 'deep' || round === rounds - 1) break
      const judgeStart = Date.now()
      const verdict = await this.think(
        judgePrompt(sub.question, fuseRanked(lists).slice(0, 8), this.cfg.queriesPerAgent),
        'judge',
        fallbacks,
        this.cfg.modelStepTokens,
      )
      timings.judgeMs += Date.now() - judgeStart
      if (!verdict) break
      roundTrace.sufficient = verdict.sufficient === true
      if (verdict.sufficient === true) break
      queries = strings(verdict.queries, this.cfg.queriesPerAgent)
    }
    return { trace, fused: fuseRanked(lists) }
  }

  private async rerank(
    question: string,
    pool: Array<KbChunk & { score: number }>,
    fallbacks: string[],
  ): Promise<Array<KbChunk & { score: number }>> {
    if (pool.length <= 1) return []
    const answer = await this.think(rerankPrompt(question, pool), 'rerank', fallbacks, this.cfg.modelStepTokens)
    if (!answer || !Array.isArray(answer.ranking)) return []
    const ranked: Array<KbChunk & { score: number }> = []
    const used = new Set<number>()
    for (const entry of answer.ranking as unknown[]) {
      if (!entry || typeof entry !== 'object') continue
      const n = Number((entry as Record<string, unknown>).n)
      const score = Number((entry as Record<string, unknown>).score)
      if (!Number.isInteger(n) || n < 1 || n > pool.length || used.has(n)) continue
      used.add(n)
      ranked.push({ ...pool[n - 1]!, score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0 })
    }
    return ranked.sort((a, b) => b.score - a.score)
  }

  async explore(query: RetrievalQuery): Promise<AgenticExploration> {
    const depth: RetrievalDepth = this.config.think ? (query.depth ?? this.cfg.defaultDepth) : 'lexical'
    const key = this.cacheKey(query, depth)
    const cached = this.cache.get(key)
    if (cached && cached.expires > Date.now()) return cached.value

    const started = Date.now()
    const topK = query.topK ?? 6
    const filter = corpusFilter(query)
    const fallbacks: string[] = []
    const timings = { planMs: 0, searchMs: 0, judgeMs: 0, rerankMs: 0, totalMs: 0 }

    // The question itself is always searched: recall never depends on the plan alone.
    const baseStart = Date.now()
    const base = await this.lexical(query.text, filter, this.cfg.candidatesPerQuery)
    timings.searchMs += Date.now() - baseStart

    let plan: PlannedSubQuestion[] = []
    let subAgents: SubAgentTrace[] = []
    let fused: Array<KbChunk & { score: number }> = fuseRanked([{ items: base, weight: 1 }])
    let reranked: Array<KbChunk & { score: number }> = []

    if (depth !== 'lexical') {
      const planStart = Date.now()
      const maxSub = depth === 'deep' ? this.cfg.maxSubAgents : 1
      const planned = await this.think(planPrompt(query, maxSub, this.cfg.queriesPerAgent), 'plan', fallbacks, this.cfg.modelStepTokens)
      timings.planMs = Date.now() - planStart
      const rawSubs = Array.isArray(planned?.subQuestions) ? (planned!.subQuestions as unknown[]) : []
      plan = rawSubs
        .slice(0, maxSub)
        .flatMap((entry) => {
          if (!entry || typeof entry !== 'object') return []
          const record = entry as Record<string, unknown>
          const question = typeof record.question === 'string' && record.question.trim() ? record.question.trim() : query.text
          return [{ question, queries: strings(record.queries, this.cfg.queriesPerAgent), articles: strings(record.articles, 4) }]
        })
      if (plan.length === 0) plan = [{ question: query.text, queries: [], articles: [] }]

      const agents = await Promise.all(plan.map((sub) => this.runSubAgent(sub, filter, depth, fallbacks, timings)))
      subAgents = agents.map((agent) => agent.trace)
      fused = fuseRanked([{ items: base, weight: 0.5 }, ...agents.map((agent) => ({ items: agent.fused, weight: 1 }))])

      const rerankStart = Date.now()
      reranked = await this.rerank(query.text, fused.slice(0, this.cfg.rerankPool), fallbacks)
      timings.rerankMs = Date.now() - rerankStart
    }

    // Passages the model left out keep their fused order behind the ranked ones.
    const rankedIds = new Set(reranked.map((chunk) => chunk.id))
    const ordered = [...reranked, ...fused.filter((chunk) => !rankedIds.has(chunk.id))].slice(0, topK)
    const final = this.config.source.withImages ? await this.config.source.withImages(ordered) : ordered
    timings.totalMs = Date.now() - started

    const exploration: AgenticExploration = {
      query: query.text,
      filter,
      topK,
      depth,
      model: depth === 'lexical' ? 'lexical' : this.model(),
      plan,
      subAgents,
      stages: {
        lexical: base.map(toItem),
        fused: fused.slice(0, this.cfg.rerankPool).map(toItem),
        reranked: reranked.map(toItem),
        final: final.map(toItem),
      },
      timings,
      fallbacks,
    }
    this.finalChunks.set(exploration, final)
    if (this.cache.size >= this.cfg.cacheSize) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(key, { expires: Date.now() + this.cfg.cacheTtlMs, value: exploration })
    return exploration
  }
}
