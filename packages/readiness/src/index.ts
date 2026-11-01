/**
 * AI-readiness engine (6 factors / 13 dimensions).
 *
 * Two capabilities:
 *   • `assess()`  · score each dimension 0–5, map country-vs-global gaps.
 *   • `whatIf()`  · project the causal effect of a policy change across
 *                   interdependent dimensions.
 */

import type { LanguageModel } from 'ai'
import { z } from 'zod'
import {
  READINESS_DIMENSION_IDS,
  READINESS_DIMENSIONS,
  DIMENSION_FACTORS,
  hasLanguage,
  dimensionTextIn,
  type CountrySituation,
  type DimensionScore,
  type DimensionText,
  type Domain,
  type Gap,
  type ReadinessDimension,
  type ReadinessLang,
  type ReadinessScenario,
  type WhatIfResult,
} from '@sps/shared'
import type { Retriever } from '@sps/retrieval'
import { citationFromChunk } from '@sps/citations'
import { generateStructured, type WebAnswer, type WebSearch } from '@sps/agents'
import type { KbChunk } from '@sps/shared'
import { applyPropagation } from './causal'
import { buildScenario, maturityLabel } from './scoring'

export * from './causal'
export * from './scoring'

/**
 * Runs `task` over `items` with at most `limit` in flight, keeping the input
 * order in the settled results. Used for the dimension fan-out: the same
 * behaviour as `Promise.allSettled`, only bounded.
 */
export async function settlePool<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length)
  let next = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next
      next += 1
      if (index >= items.length) return
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index]!) }
      } catch (error) {
        results[index] = { status: 'rejected', reason: error }
      }
    }
  }

  const workers = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

export interface ReadinessInput {
  country: string
  domain: Domain
  dimensions?: ReadinessDimension[]
  /** ISO alpha-2 of the best-practice corpus, or 'global'. */
  globalCountry?: string
  perDimensionK?: number
  weights?: Partial<Record<ReadinessDimension, number>>
  /** Live web search for each dimension (default on when the provider offers it). */
  useWeb?: boolean
  /** Reasoning depth for each evaluation (default low). */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  /** Models chosen per task (ids of the operator's chat models); absent means the default. */
  models?: { webSearch?: string; evaluate?: string; synthesis?: string }
  /** Dimensions already scored by an interrupted run: they are kept, not evaluated again. */
  completed?: DimensionScore[]
  /**
   * Dimensions evaluated at the same time (default), one after another, or in the
   * order a lead agent decides (`orchestrated`, see `lead`).
   */
  concurrency?: 'parallel' | 'sequential' | 'orchestrated'
  /**
   * In `parallel` mode, how many dimensions may be in flight at once (default 4).
   * Thirteen cells at once per sector multiplies into a burst no single
   * instance should absorb.
   */
  dimensionConcurrency?: number
  /** Aborted when the caller goes away: the run stops instead of burning credits. */
  signal?: AbortSignal
  /** Orchestrated mode: the most decisions the lead may take (default 20). */
  maxDecisions?: number
  /** Orchestrated mode: the lead agent's next decision, given what is scored so far. */
  lead?: (state: LeadState) => Promise<LeadDecision | null>
  /** The language of the lead's reasons and of the engine's messages (default English). */
  language?: ReadinessLang
}

export interface LeadState {
  country: string
  domain: Domain
  /** Dimensions not scored yet, in the default order. */
  remaining: Array<{ dimension: ReadinessDimension; dimensionId: number; name: string }>
  /** Dimensions already scored, with their score. */
  done: Array<{ dimension: ReadinessDimension; dimensionId: number; name: string; score: number; confidence: number; gaps: number }>
  decisionsLeft: number
  language?: ReadinessLang
}

export type LeadDecision =
  | { action: 'evaluate' | 'reevaluate'; dimension: ReadinessDimension; hint?: string; reason: string }
  | { action: 'finish'; reason: string }

export interface LeadStep {
  action: 'evaluate' | 'reevaluate' | 'finish'
  dimension?: ReadinessDimension
  hint?: string
  reason: string
  /** The decision was not usable: the next pending dimension, in the default order, was taken instead. */
  fallback: boolean
}

/**
 * Checks the lead's decision against what is scored so far. An unusable decision
 * (unknown dimension, re-scoring a dimension not yet scored, finishing early, no
 * decision at all) falls back to the next pending dimension, so every dimension is
 * still evaluated.
 */
export function resolveLeadStep(decision: LeadDecision | null, state: LeadState): LeadStep {
  const next = state.remaining[0]
  const fr = state.language === 'fr'
  const fallback = (reason: string): LeadStep =>
    next ? { action: 'evaluate', dimension: next.dimension, reason, fallback: true } : { action: 'finish', reason, fallback: true }
  if (!decision) return fallback(fr ? 'Pas de décision exploitable : dimension suivante dans l’ordre.' : 'No usable decision: the next dimension in order.')
  if (decision.action === 'finish') {
    if (state.remaining.length === 0) return { action: 'finish', reason: decision.reason, fallback: false }
    return fallback(fr ? 'Arrêt refusé : des dimensions restent à évaluer.' : 'Finish refused: dimensions are still pending.')
  }
  const again = decision.action === 'reevaluate'
  const valid = again
    ? state.done.some((entry) => entry.dimension === decision.dimension)
    : state.remaining.some((entry) => entry.dimension === decision.dimension)
  if (!valid)
    return fallback(
      again
        ? fr ? 'Nouvelle évaluation d’une dimension non encore notée : dimension suivante dans l’ordre.' : 'Re-evaluation of a dimension not yet scored: the next dimension in order.'
        : fr ? 'Dimension inconnue ou déjà notée : dimension suivante dans l’ordre.' : 'Unknown or already scored dimension: the next dimension in order.',
    )
  return { action: decision.action, dimension: decision.dimension, ...(decision.hint ? { hint: decision.hint } : {}), reason: decision.reason, fallback: false }
}

/** An assessment stopped by an error. `completed` holds the dimensions scored before it. */
export class ReadinessInterrupted extends Error {
  constructor(
    message: string,
    readonly completed: DimensionScore[],
  ) {
    super(message)
    this.name = 'ReadinessInterrupted'
  }
}

/** Retries a call that fails transiently (the embeddings provider answers 5xx now and then). */
async function withRetry<T>(call: () => Promise<T>, attempts = 3, delayMs = 1500): Promise<T> {
  let last: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await call()
    } catch (error) {
      last = error
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs * attempt))
    }
  }
  throw last
}

/** Progress of one assessment, in the order it happens. */
export type ReadinessEvent =
  | {
      type: 'start'
      country: string
      domain: Domain
      dimensions: Array<{ dimension: ReadinessDimension; dimensionId: number; name: string }>
    }
  | { type: 'web'; dimension: ReadinessDimension; durationMs: number; sources: Array<{ title: string; url: string }> }
  | { type: 'running'; dimension: ReadinessDimension; dimensionId: number; name: string }
  | {
      type: 'result'
      dimension: ReadinessDimension
      dimensionId: number
      durationMs: number
      score: DimensionScore
      /** The model's reasoning for this dimension (summary-level, may be empty). */
      reasoning: string
      attempts: number
      countryPassages: number
      globalPassages: number
    }
  | { type: 'error'; dimension: ReadinessDimension; dimensionId: number; durationMs: number; message: string }
  | { type: 'restored'; dimension: ReadinessDimension; dimensionId: number; score: DimensionScore }
  | {
      type: 'decision'
      /** Decisions taken so far, this one included. */
      index: number
      action: LeadStep['action']
      dimension?: ReadinessDimension
      dimensionId?: number
      reason: string
      hint?: string
      fallback: boolean
    }
  | { type: 'done'; report: ReadinessReport }

export interface ReadinessReport {
  country: string
  domain: Domain
  generatedAt: string
  dimensions: Array<{
    dimension: ReadinessDimension
    dimensionId: number
    gaps: Gap[]
    countryChunks: KbChunk[]
    globalChunks: KbChunk[]
  }>
  scores: DimensionScore[]
  scenario: ReadinessScenario
  summary: string
  /** The country's situation against the global context, per language. */
  situation?: Partial<Record<ReadinessLang, CountrySituation>>
}

const severity = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.enum(['low', 'medium', 'high', 'critical']),
)

const textSchema = z.object({
  evidence: z.array(z.string()).default([]),
  gaps: z
    .array(
      z.object({
        description: z.string(),
        severity,
        globalBestPractice: z.string().optional(),
      }),
    )
    .default([]),
  recommendations: z.array(z.string()).default([]),
  summary: z.string().default(''),
})

/** The score is language-free; the written part comes in English and in French. */
const dimensionSchema = z.object({
  score: z.coerce.number().min(0).max(5).describe('Maturity 0-5 per the readiness framework'),
  confidence: z.coerce.number().min(0).max(1).default(0.5),
  // Both languages in the same answer: a missing one makes the model answer again.
  en: textSchema,
  fr: textSchema,
})

const situationSchema = z.object({
  headline: z.string().default(''),
  situation: z.string().default(''),
  context: z.string().default(''),
})

const TEXT_SHAPE =
  '{"summary": string, "evidence": string[], "gaps": [{"description": string, "severity": "low"|"medium"|"high"|"critical", "globalBestPractice": string}], "recommendations": string[]}'

const BILINGUAL_RULE =
  'Write the written part twice, identically in meaning: once under "en" (English) and once under "fr" (French, professional register). Never leave one language empty.'

function dimensionMeta(dimension: ReadinessDimension) {
  return READINESS_DIMENSIONS.find((d) => d.shortName === dimension)!
}

export class ReadinessEngine {
  constructor(
    private readonly deps: {
      model: LanguageModel
      retriever: Retriever
      webSearch?: WebSearch
      /** Builds the evaluation model for a chosen id. */
      modelFor?: (id: string) => LanguageModel
      /** Builds the web search for a chosen model id. */
      webSearchFor?: (id: string) => WebSearch | undefined
    },
  ) {}

  /**
   * Scores every dimension. `emit` receives progress as it happens (one event per
   * step), so a caller can show the process live; the returned report is the same
   * with or without it.
   */
  async assess(input: ReadinessInput, emit?: (event: ReadinessEvent) => void): Promise<ReadinessReport> {
    const dimensions = input.dimensions ?? READINESS_DIMENSION_IDS
    const globalCountry = input.globalCountry ?? 'global'
    const perDimensionK = input.perDimensionK ?? 5
    const kept = new Map((input.completed ?? []).map((score) => [score.dimension, score]))
    const pending = dimensions.filter((dimension) => !kept.has(dimension))
    const maxDecisions = input.maxDecisions ?? 20
    /** Bounded fan-out: 13 cells at once per sector is an avoidable burst. */
    const dimensionLimit = Math.max(1, input.dimensionConcurrency ?? 4)

    const results: ReadinessReport['dimensions'] = []
    const scores: DimensionScore[] = []
    emit?.({
      type: 'start',
      country: input.country,
      domain: input.domain,
      dimensions: dimensions.map((dimension) => ({
        dimension,
        dimensionId: dimensionMeta(dimension).id,
        name: dimensionMeta(dimension).name,
      })),
    })

    const web = new Map<ReadinessDimension, WebAnswer | null>()
    /** Live web evidence for a dimension, searched once. A failed search leaves the dimension to the corpus alone. */
    const searchOf = async (dimension: ReadinessDimension): Promise<WebAnswer | null> => {
      if (web.has(dimension)) return web.get(dimension) ?? null
      const chosen = input.models?.webSearch && this.deps.webSearchFor ? this.deps.webSearchFor(input.models.webSearch) : undefined
      const search = input.useWeb === false ? undefined : (chosen ?? this.deps.webSearch)
      const def = dimensionMeta(dimension)
      if (!search) {
        web.set(dimension, null)
        return null
      }
      const started = Date.now()
      const answer = await search(`${def.name} national AI readiness policy ${countryName(input.country)} ${new Date().getFullYear()}`).catch(() => null)
      emit?.({
        type: 'web',
        dimension,
        durationMs: Date.now() - started,
        sources: answer?.sources.slice(0, 6).map(({ title, url }) => ({ title, url })) ?? [],
      })
      web.set(dimension, answer)
      return answer
    }
    // Gathered first and in parallel, except in orchestrated mode: the lead reaches each dimension in its own order.
    if (input.concurrency !== 'orchestrated') {
      await settlePool(pending, dimensionLimit, searchOf)
    }

    /** Evaluates one dimension: its score is pushed when it is done. Throws when it fails. */
    const evaluateOne = async (dimension: ReadinessDimension, options: { again?: boolean; hint?: string } = {}): Promise<void> => {
      const def = dimensionMeta(dimension)
      const keptScore = kept.get(dimension)
      if (keptScore && !options.again) {
        scores.push(keptScore)
        results.push({ dimension, dimensionId: def.id, gaps: [], countryChunks: [], globalChunks: [] })
        emit?.({ type: 'restored', dimension, dimensionId: def.id, score: keptScore })
        return
      }
      const live = await searchOf(dimension)
      const started = Date.now()
      emit?.({ type: 'running', dimension, dimensionId: def.id, name: def.name })
      try {
        const [countryChunks, globalChunks] = await withRetry(() =>
          Promise.all([
            this.deps.retriever.search({ text: def.name, country: input.country, topK: perDimensionK }),
            this.deps.retriever.search({ text: def.name, country: globalCountry, topK: perDimensionK }),
          ]),
        )
        const attempts: Array<{ attempt: number; reasoning: string; valid: boolean }> = []

        const evaluator = input.models?.evaluate && this.deps.modelFor ? this.deps.modelFor(input.models.evaluate) : this.deps.model
        const object = await generateStructured({
          model: evaluator,
          schema: dimensionSchema,
          shape: `{"score": number 0-5, "confidence": number 0-1, "en": ${TEXT_SHAPE}, "fr": ${TEXT_SHAPE}}`,
          attempts: 3,
          maxOutputTokens: 8192,
          reasoningEffort: input.reasoningEffort ?? 'low',
          ...(input.signal ? { signal: input.signal } : {}),
          onAttempt: (info) => attempts.push({ attempt: info.attempt, reasoning: info.reasoning, valid: info.valid }),
          system: `You assess country "${input.country}" AI readiness on the dimension "${def.name}" (factors: ${def.factors.join(', ')}), domain "${input.domain}".
Score maturity on 0–5 (0 Not Started, 3 Established, 5 Leading). Compare COUNTRY provisions to GLOBAL best practice. Identify concrete gaps: unclear responsibilities, missing standards, legislative gaps, coordination problems, conflicts between objectives. Ground every claim in the passages. Do not analyse specific geographies; focus on domain-specific gaps and relevant global examples. ${BILINGUAL_RULE}`,
          prompt: `COUNTRY PROVISIONS:\n${countryChunks.map((c) => c.text).join('\n---\n') || '(none)'}\n\nGLOBAL BEST PRACTICE:\n${globalChunks.map((c) => c.text).join('\n---\n') || '(none)'}${live?.text ? `\n\nLIVE WEB (recent, not legal sources; say when a point comes from the web):\n${live.text.slice(0, 3000)}` : ''}${options.hint ? `\n\nFOCUS FOR THIS PASS (set by the lead agent, who has read the other dimensions): ${options.hint}` : ''}`,
        })

        const base = object.en ?? object.fr
        const localized: DimensionScore['localized'] = {
          ...(object.en ? { en: textOf(object.en) } : {}),
          ...(object.fr ? { fr: textOf(object.fr) } : {}),
        }
        const gaps: Gap[] = (base?.gaps ?? []).map((gap, i) => ({
          id: `${dimension}-${i}`,
          domain: input.domain,
          dimension,
          description: gap.description,
          severity: gap.severity,
          countryRef: countryChunks[0] ? citationFromChunk(countryChunks[0]) : undefined,
          globalBestPractice: gap.globalBestPractice,
          globalRef: globalChunks[0] ? citationFromChunk(globalChunks[0]) : undefined,
        }))
        const webSources = live && live.sources.length > 0 ? live.sources.slice(0, 6).map(({ title, url }) => ({ title, url })) : undefined
        const score: DimensionScore = {
          dimension,
          dimensionId: def.id,
          dimensionName: def.name,
          score: Number(object.score.toFixed(2)),
          maturity: maturityLabel(object.score),
          summary: base?.summary ?? '',
          evidence: base?.evidence ?? [],
          gaps: gaps.map((g) => g.description),
          recommendations: base?.recommendations ?? [],
          confidence: object.confidence,
          localized,
          ...(webSources ? { webSources } : {}),
        }
        // A new pass on a dimension replaces its earlier score.
        const staleScore = scores.findIndex((entry) => entry.dimension === dimension)
        if (staleScore >= 0) scores.splice(staleScore, 1)
        const staleResult = results.findIndex((entry) => entry.dimension === dimension)
        if (staleResult >= 0) results.splice(staleResult, 1)
        results.push({ dimension, dimensionId: def.id, gaps, countryChunks, globalChunks })
        scores.push(score)
        emit?.({
          type: 'result',
          dimension,
          dimensionId: def.id,
          durationMs: Date.now() - started,
          score,
          reasoning: attempts.map((attempt) => attempt.reasoning).filter(Boolean).join('\n\n'),
          attempts: attempts.length,
          countryPassages: countryChunks.length,
          globalPassages: globalChunks.length,
        })
      } catch (error) {
        emit?.({ type: 'error', dimension, dimensionId: def.id, durationMs: Date.now() - started, message: (error as Error).message })
        throw error
      }
    }

    if (input.concurrency === 'orchestrated') {
      try {
        for (const dimension of dimensions) {
          if (kept.has(dimension)) await evaluateOne(dimension)
        }
        // The lead decides the next step from what is scored; each decision counts toward the maximum.
        let used = 0
        for (;;) {
          const state: LeadState = {
            country: input.country,
            domain: input.domain,
            remaining: dimensions
              .filter((dimension) => !scores.some((entry) => entry.dimension === dimension))
              .map((dimension) => ({ dimension, dimensionId: dimensionMeta(dimension).id, name: dimensionMeta(dimension).name })),
            done: scores.map((entry) => ({
              dimension: entry.dimension,
              dimensionId: entry.dimensionId,
              name: entry.dimensionName,
              score: entry.score,
              confidence: entry.confidence,
              gaps: entry.gaps.length,
            })),
            decisionsLeft: Math.max(0, maxDecisions - used),
            ...(input.language ? { language: input.language } : {}),
          }
          const decision = input.lead && used < maxDecisions ? await input.lead(state).catch(() => null) : null
          used += 1
          const step = resolveLeadStep(decision, state)
          emit?.({
            type: 'decision',
            index: used,
            action: step.action,
            ...(step.dimension ? { dimension: step.dimension, dimensionId: dimensionMeta(step.dimension).id } : {}),
            reason: step.reason,
            ...(step.hint ? { hint: step.hint } : {}),
            fallback: step.fallback,
          })
          if (step.action === 'finish' || !step.dimension) break
          await evaluateOne(step.dimension, { again: step.action === 'reevaluate', ...(step.hint ? { hint: step.hint } : {}) })
        }
      } catch (error) {
        throw new ReadinessInterrupted((error as Error).message, [...scores])
      }
    } else if (input.concurrency === 'sequential') {
      for (const dimension of dimensions) {
        try {
          await evaluateOne(dimension)
        } catch (error) {
          throw new ReadinessInterrupted((error as Error).message, [...scores])
        }
      }
    } else {
      // In parallel, every dimension runs to its end: one failure does not discard the others.
      const outcomes = await settlePool(dimensions, dimensionLimit, (dimension) => evaluateOne(dimension))
      const failed = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')
      if (failed) throw new ReadinessInterrupted((failed.reason as Error).message, [...scores])
    }
    scores.sort((a, b) => a.dimensionId - b.dimensionId)

    const scenario = buildScenario(input.country, input.domain, scores, input.weights)
    const totalGaps = results.reduce((sum, r) => sum + r.gaps.length, 0)
    const situation = await this.situation(input, scores, scenario.composite, input.models?.synthesis)
    let report: ReadinessReport = {
      country: input.country,
      domain: input.domain,
      generatedAt: scenario.generatedAt,
      dimensions: results,
      scores,
      scenario,
      summary: `Scored ${dimensions.length} dimensions for ${input.country.toUpperCase()} (composite ${scenario.composite}/5); found ${totalGaps} gaps.`,
      ...(situation ? { situation } : {}),
    }
    // Both languages, whatever the model wrote: a missing one is translated from the other.
    for (const lang of ['en', 'fr'] as const) {
      if (hasLanguage(report.scores, lang)) continue
      try {
        report = await this.localize(report, lang, input.models?.synthesis, input.signal)
      } catch {
        // The report keeps the language it has; the other is added when it is opened.
      }
    }
    report = { ...report, scenario: { ...report.scenario, dimensions: report.scores } }
    emit?.({ type: 'done', report })
    return report
  }

  /**
   * The country's situation against the global context, in both languages. A
   * failure leaves the report without it: the scores stand on their own.
   */
  private async situation(
    input: ReadinessInput,
    scores: DimensionScore[],
    composite: number,
    synthesisModel?: string,
  ): Promise<ReadinessReport['situation'] | undefined> {
    const model = synthesisModel && this.deps.modelFor ? this.deps.modelFor(synthesisModel) : this.deps.model
    const table = scores.map((score) => `D${score.dimensionId} ${score.dimensionName}: ${score.score}/5 (${score.maturity})`).join('\n')
    try {
      const object = await generateStructured({
        model,
        schema: z.object({ en: situationSchema, fr: situationSchema }),
        shape: '{"en": {"headline": string, "situation": string, "context": string}, "fr": {"headline": string, "situation": string, "context": string}}',
        attempts: 2,
        maxOutputTokens: 4096,
        reasoningEffort: 'low',
        ...(input.signal ? { signal: input.signal } : {}),
        system: `You write the national summary of an AI-readiness assessment for "${input.country}", domain "${input.domain}". "situation" states where the country stands today against the global best practice, in 3 to 5 sentences grounded in the scores. "context" says what this means for the domain and what matters most next, in 2 to 3 sentences. "headline" is one line. ${BILINGUAL_RULE}`,
        prompt: `Composite score: ${composite}/5.\n${table}`,
      })
      return { en: object.en, fr: object.fr }
    } catch {
      return undefined
    }
  }

  /**
   * Adds the text of a saved assessment in `lang`, from the text it already has.
   * Used for assessments made before bilingual output, or when a language is missing.
   */
  async localize(
    report: ReadinessReport,
    lang: ReadinessLang,
    synthesisModel?: string,
    signal?: AbortSignal,
  ): Promise<ReadinessReport> {
    const source = report.scores.map((score) => ({
      dimensionId: score.dimensionId,
      name: score.dimensionName,
      ...dimensionTextIn(score, 'en'),
    }))
    const languageName = lang === 'fr' ? 'French' : 'English'
    const textSchemaOut = z.object({
      dimensions: z.array(
        z.object({
          dimensionId: z.coerce.number(),
          summary: z.string().default(''),
          evidence: z.array(z.string()).default([]),
          gaps: z.array(z.string()).default([]),
          recommendations: z.array(z.string()).default([]),
        }),
      ),
      situation: situationSchema.optional(),
    })
    const model = synthesisModel && this.deps.modelFor ? this.deps.modelFor(synthesisModel) : this.deps.model
    const object = await generateStructured({
      model,
      schema: textSchemaOut,
      shape:
        '{"dimensions": [{"dimensionId": number, "summary": string, "evidence": string[], "gaps": string[], "recommendations": string[]}], "situation": {"headline": string, "situation": string, "context": string}}',
      attempts: 3,
      maxOutputTokens: 12000,
      reasoningEffort: 'low',
      ...(signal ? { signal } : {}),
      system: `Translate the assessment text below into ${languageName}. Keep the meaning, the figures and the list lengths exactly; keep each dimensionId. Do not add or drop points.`,
      prompt: JSON.stringify({ dimensions: source, situation: report.situation?.en ?? report.situation?.fr ?? null }),
    })
    const byId = new Map(object.dimensions.map((entry) => [entry.dimensionId, entry]))
    const scores = report.scores.map((score) => {
      const translated = byId.get(score.dimensionId)
      if (!translated) return score
      const text: DimensionText = {
        summary: translated.summary,
        evidence: translated.evidence,
        gaps: translated.gaps,
        recommendations: translated.recommendations,
      }
      return { ...score, localized: { ...score.localized, [lang]: text } }
    })
    const situation = object.situation
      ? { ...report.situation, [lang]: object.situation }
      : report.situation
    return { ...report, scores, ...(situation ? { situation } : {}) }
  }
}

function textOf(text: z.infer<typeof textSchema>): DimensionText {
  return {
    summary: text.summary,
    evidence: text.evidence,
    gaps: text.gaps.map((gap) => gap.description),
    recommendations: text.recommendations,
  }
}

function countryName(code: string): string {
  return code === 'cm' ? 'Cameroon' : code.toUpperCase()
}

/** Project the causal effect of a policy change across interdependent dimensions. */
export function whatIf(input: {
  country: string
  domain: Domain
  scores: DimensionScore[]
  changes: Partial<Record<ReadinessDimension, number>>
}): WhatIfResult {
  const { projected, effects } = applyPropagation(input.scores, input.changes)

  const lines = Object.entries(input.changes)
    .filter(([, delta]) => delta)
    .map(([name, delta]) => {
      const def = READINESS_DIMENSIONS.find((d) => d.shortName === name)
      return `• ${def?.name ?? name} ${delta! >= 0 ? '+' : ''}${delta}`
    })

  const propagated = Object.entries(effects)
    .filter(([name]) => !(name in input.changes))
    .map(([name, delta]) => {
      const def = READINESS_DIMENSIONS.find((d) => d.shortName === name)
      return `→ ${def?.name ?? name} ${delta! >= 0 ? '+' : ''}${delta}`
    })

  const narrative = [
    'Direct changes:',
    ...(lines.length ? lines : ['• (none)']),
    '',
    'Causal propagation:',
    ...(propagated.length ? propagated : ['→ (no downstream effect)']),
  ].join('\n')

  return {
    country: input.country,
    domain: input.domain,
    changes: input.changes,
    original: input.scores,
    projected,
    effects,
    narrative,
    generatedAt: new Date().toISOString(),
  }
}

export function renderReadinessMarkdown(report: ReadinessReport): string {
  const lines = [
    `# AI Readiness Assessment · ${report.country.toUpperCase()} (${report.domain})`,
    '',
    `_${report.summary}_`,
    '',
  ]
  for (const score of report.scores) {
    const factors = DIMENSION_FACTORS[score.dimension]?.join(', ') ?? ''
    lines.push(`## D${score.dimensionId} ${score.dimensionName} · ${score.score}/5 (${score.maturity})`)
    lines.push(`_Factors: ${factors} · confidence ${score.confidence}_`, '')
    for (const gap of score.gaps) lines.push(`- ${gap}`)
    lines.push('')
  }
  return lines.join('\n')
}
