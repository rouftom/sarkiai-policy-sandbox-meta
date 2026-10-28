/**
 * AI-readiness engine (6 factors / 13 dimensions).
 *
 * Two capabilities:
 *   • `assess()`  — score each dimension 0–5, map country-vs-global gaps.
 *   • `whatIf()`  — project the causal effect of a policy change across
 *                   interdependent dimensions.
 */

import type { LanguageModel } from 'ai'
import { z } from 'zod'
import {
  READINESS_DIMENSION_IDS,
  READINESS_DIMENSIONS,
  DIMENSION_FACTORS,
  type DimensionScore,
  type Domain,
  type Gap,
  type ReadinessDimension,
  type ReadinessScenario,
  type WhatIfResult,
} from '@sps/shared'
import type { Retriever } from '@sps/retrieval'
import { citationFromChunk } from '@sps/citations'
import { generateStructured } from '@sps/agents'
import type { KbChunk } from '@sps/shared'
import { applyPropagation } from './causal'
import { buildScenario, maturityLabel } from './scoring'

export * from './causal'
export * from './scoring'

export interface ReadinessInput {
  country: string
  domain: Domain
  dimensions?: ReadinessDimension[]
  /** ISO alpha-2 of the best-practice corpus, or 'global'. */
  globalCountry?: string
  perDimensionK?: number
  weights?: Partial<Record<ReadinessDimension, number>>
}

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
}

const dimensionSchema = z.object({
  score: z.number().min(0).max(5).describe('Maturity 0-5 per the readiness framework'),
  confidence: z.number().min(0).max(1).default(0.5),
  evidence: z.array(z.string()).default([]),
  gaps: z
    .array(
      z.object({
        description: z.string(),
        severity: z.enum(['low', 'medium', 'high', 'critical']),
        globalBestPractice: z.string().optional(),
      }),
    )
    .default([]),
  recommendations: z.array(z.string()).default([]),
  summary: z.string().default(''),
})

function dimensionMeta(dimension: ReadinessDimension) {
  return READINESS_DIMENSIONS.find((d) => d.shortName === dimension)!
}

export class ReadinessEngine {
  constructor(
    private readonly deps: { model: LanguageModel; retriever: Retriever },
  ) {}

  async assess(input: ReadinessInput): Promise<ReadinessReport> {
    const dimensions = input.dimensions ?? READINESS_DIMENSION_IDS
    const globalCountry = input.globalCountry ?? 'global'
    const perDimensionK = input.perDimensionK ?? 5

    const results: ReadinessReport['dimensions'] = []
    const scores: DimensionScore[] = []

    for (const dimension of dimensions) {
      const def = dimensionMeta(dimension)
      const query = def.name
      const [countryChunks, globalChunks] = await Promise.all([
        this.deps.retriever.search({ text: query, country: input.country, topK: perDimensionK }),
        this.deps.retriever.search({ text: query, country: globalCountry, topK: perDimensionK }),
      ])

      const object = await generateStructured({
        model: this.deps.model,
        schema: dimensionSchema,
        shape:
          '{"score": number 0-5, "confidence": number 0-1, "evidence": string[], "gaps": [{"description": string, "severity": "low"|"medium"|"high"|"critical", "globalBestPractice": string}]}',
        attempts: 3,
        maxOutputTokens: 2048,
        system: `You assess country "${input.country}" AI readiness on the dimension "${def.name}" (factors: ${def.factors.join(', ')}), domain "${input.domain}".
Score maturity on 0–5 (0 Not Started, 3 Established, 5 Leading). Compare COUNTRY provisions to GLOBAL best practice. Identify concrete gaps: unclear responsibilities, missing standards, legislative gaps, coordination problems, conflicts between objectives. Ground every claim in the passages. Do not analyse specific geographies; focus on domain-specific gaps and relevant global examples.`,
        prompt: `COUNTRY PROVISIONS:\n${countryChunks.map((c) => c.text).join('\n---\n') || '(none)'}\n\nGLOBAL BEST PRACTICE:\n${globalChunks.map((c) => c.text).join('\n---\n') || '(none)'}`,
      })

      const gaps: Gap[] = object.gaps.map((gap, i) => ({
        id: `${dimension}-${i}`,
        domain: input.domain,
        dimension,
        description: gap.description,
        severity: gap.severity,
        countryRef: countryChunks[0] ? citationFromChunk(countryChunks[0]) : undefined,
        globalBestPractice: gap.globalBestPractice,
        globalRef: globalChunks[0] ? citationFromChunk(globalChunks[0]) : undefined,
      }))

      results.push({ dimension, dimensionId: def.id, gaps, countryChunks, globalChunks })
      scores.push({
        dimension,
        dimensionId: def.id,
        dimensionName: def.name,
        score: Number(object.score.toFixed(2)),
        maturity: maturityLabel(object.score),
        evidence: object.evidence,
        gaps: gaps.map((g) => g.description),
        recommendations: object.recommendations,
        confidence: object.confidence,
      })
    }

    const scenario = buildScenario(input.country, input.domain, scores, input.weights)
    const totalGaps = results.reduce((sum, r) => sum + r.gaps.length, 0)
    return {
      country: input.country,
      domain: input.domain,
      generatedAt: scenario.generatedAt,
      dimensions: results,
      scores,
      scenario,
      summary: `Scored ${dimensions.length} dimensions for ${input.country.toUpperCase()} (composite ${scenario.composite}/5); found ${totalGaps} gaps.`,
    }
  }
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
    `# AI Readiness Assessment — ${report.country.toUpperCase()} (${report.domain})`,
    '',
    `_${report.summary}_`,
    '',
  ]
  for (const score of report.scores) {
    const factors = DIMENSION_FACTORS[score.dimension]?.join(', ') ?? ''
    lines.push(`## D${score.dimensionId} ${score.dimensionName} — ${score.score}/5 (${score.maturity})`)
    lines.push(`_Factors: ${factors} · confidence ${score.confidence}_`, '')
    for (const gap of score.gaps) lines.push(`- ${gap}`)
    lines.push('')
  }
  return lines.join('\n')
}
