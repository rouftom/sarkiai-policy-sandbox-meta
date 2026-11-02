/**
 * N7 · legislative impact on open incidents.
 *
 * A new decree does not create a new case: it re-opens the ones already running.
 * This module takes the new provision and the citations/facts of the open runs,
 * and asks the model which runs are actually affected, how severely, and what
 * has to be re-run (deadlines, notification duties, approvals).
 *
 * Two layers, deliberately separate:
 *   • `matchAffected` is deterministic · same article or same instrument means
 *     the run is a candidate, and that set is never widened by the model;
 *   • the model only *ranks and explains* the candidates it is given. A finding
 *     naming an unknown run is dropped, so the analysis cannot invent a case.
 */

import { generateText, type LanguageModel } from 'ai'
import type { Citation } from '@sps/shared'

export type ImpactSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface Provision {
  title: string
  text: string
  articleNumber?: string
  docType?: string
  sourceUrl?: string
  effectiveDate?: string
}

export interface OpenCase {
  runId: string
  country: string
  domain: string
  citations: Citation[]
  /** Released incident facts, as plain text. */
  facts: string[]
  reports: number
}

export interface ImpactFinding {
  runId: string
  severity: ImpactSeverity
  reason: string
  affectedArticles: string[]
  action: string
}

export interface ImpactAnalysis {
  provision: Provision
  summary: string
  findings: ImpactFinding[]
  deadlineChanges: string[]
  unaffectedRunIds: string[]
  model: string
  generatedAt: string
}

export interface AnalyzeImpactInput {
  model: LanguageModel
  modelLabel: string
  provision: Provision
  cases: OpenCase[]
  maxOutputTokens?: number
  /** How many times a reply without usable JSON is asked again. Defaults to 2. */
  attempts?: number
  /**
   * `providerOptions` namespace of the active model (`meta`, `baseten`, …).
   * Without it the effort is sent under the two historical keys.
   */
  providerName?: string
  /** Inject a fake generator in tests. */
  deps?: { interpret?: (prompt: string) => Promise<string> }
}

const SEVERITIES: ImpactSeverity[] = ['low', 'medium', 'high', 'critical']

/** "ARTICLE 12 bis" → "12 bis"; spacing and case are not meaningful. */
export function normalizeArticle(value: string | undefined): string {
  if (!value) return ''
  return value
    .replace(/^\s*(?:ARTICLE|ART\.?)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalizeFilename(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Deterministic candidate set: a case is touched when it cites the same article
 * of the same instrument. When the new provision has no article number (a
 * framework law, a strategy), every open case is a candidate · the model decides
 * which ones actually change.
 */
export function matchAffected(cases: OpenCase[], provision: Provision): OpenCase[] {
  const desiredArticle = normalizeArticle(provision.articleNumber)
  if (!desiredArticle) return [...cases]
  const desiredFile = normalizeFilename(provision.title)
  return cases.filter((openCase) =>
    openCase.citations.some((citation) => {
      if (normalizeArticle(citation.articleNumber) !== desiredArticle) return false
      const file = normalizeFilename(citation.filename)
      return !desiredFile || !file || file.includes(desiredFile.slice(0, 12)) || desiredFile.includes(file.slice(0, 12))
    }),
  )
}

export function buildImpactPrompt(provision: Provision, cases: OpenCase[]): string {
  const blocks = cases.map((openCase) => {
    const citations = openCase.citations
      .map((citation) => {
        const label = [citation.filename, citation.articleNumber, citation.headingPath].filter(Boolean).join(' · ')
        const quote = (citation.quote ?? '').replace(/\s+/g, ' ').slice(0, 400)
        return `- ${label}: ${quote}`
      })
      .join('\n')
    const facts = openCase.facts.map((fact) => `- ${fact}`).join('\n')
    return [
      `RUN ${openCase.runId} (${openCase.country.toUpperCase()} · ${openCase.domain} · ${openCase.reports} joint report(s))`,
      'Citations:',
      citations || '- (none)',
      'Released facts:',
      facts || '- (none)',
    ].join('\n')
  })

  return [
    'You are a legal-impact analyst for an incident-response sandbox.',
    'A new provision has been published. Decide which open runs it changes, and how.',
    '',
    'NEW PROVISION',
    `Title: ${provision.title}`,
    provision.articleNumber ? `Article: ${provision.articleNumber}` : 'Article: (not numbered)',
    provision.effectiveDate ? `Effective: ${provision.effectiveDate}` : 'Effective: (unspecified)',
    provision.sourceUrl ? `Source: ${provision.sourceUrl}` : '',
    'Text:',
    provision.text,
    '',
    'OPEN RUNS',
    ...blocks,
    '',
    'Rules:',
    '- Only use the run ids listed above. Never invent a run, an article or a fact.',
    '- A run is affected when the new provision changes a duty, a deadline, an approval, or the applicable article it relies on.',
    '- If nothing changes for a run, do not report it.',
    '- Quote article numbers exactly as they appear.',
    '',
    'Return JSON only, no prose and no code fence:',
    '{"summary":"one paragraph","findings":[{"runId":"...","severity":"low|medium|high|critical","reason":"...","affectedArticles":["..."],"action":"what to re-run"}],"deadlineChanges":["..."],"unaffectedRunIds":["..."]}',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

interface RawImpact {
  summary?: unknown
  findings?: unknown
  deadlineChanges?: unknown
  unaffectedRunIds?: unknown
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : []
}

/**
 * Parse the model's JSON, tolerating a code fence or a stray sentence. Findings
 * for unknown runs are dropped · that is the one failure mode that matters,
 * because a fabricated case would be read as a real institutional obligation.
 */
export function parseImpact(raw: string, knownRunIds: string[]): Omit<ImpactAnalysis, 'provision' | 'model' | 'generatedAt'> {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('The impact analysis did not return JSON.')

  let payload: RawImpact
  try {
    payload = JSON.parse(raw.slice(start, end + 1)) as RawImpact
  } catch {
    throw new Error('The impact analysis returned malformed JSON.')
  }

  const known = new Set(knownRunIds)
  const findings: ImpactFinding[] = []
  for (const item of Array.isArray(payload.findings) ? payload.findings : []) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const runId = asString(record.runId)
    if (!known.has(runId)) continue
    const severity = asString(record.severity).toLowerCase() as ImpactSeverity
    findings.push({
      runId,
      severity: SEVERITIES.includes(severity) ? severity : 'medium',
      reason: asString(record.reason),
      affectedArticles: asStringArray(record.affectedArticles),
      action: asString(record.action),
    })
  }

  return {
    summary: asString(payload.summary),
    findings,
    deadlineChanges: asStringArray(payload.deadlineChanges),
    unaffectedRunIds: asStringArray(payload.unaffectedRunIds).filter((runId) => known.has(runId)),
  }
}

/**
 * One model call. Reasoning tokens count against `maxOutputTokens`: on a deep
 * pass the whole budget can go to the reasoning channel and leave `text` empty,
 * which parseImpact would report as "did not return JSON". Ranking is a short
 * structured step, so a light pass keeps the visible answer inside the budget;
 * the reasoning channel is read as a fallback for models that answer there.
 */
async function interpretImpact(input: AnalyzeImpactInput, prompt: string): Promise<string> {
  const effort = { reasoningEffort: 'low' }
  const result = await generateText({
    model: input.model,
    maxOutputTokens: input.maxOutputTokens ?? 8192,
    providerOptions: input.providerName
      ? { [input.providerName]: effort }
      : { meta: effort, openaiCompatible: effort },
    messages: [{ role: 'user', content: prompt }],
  })
  return result.text?.trim() || result.reasoningText || ''
}

export async function analyzeImpact(input: AnalyzeImpactInput): Promise<ImpactAnalysis> {
  const candidates = matchAffected(input.cases, input.provision)
  const base = {
    provision: input.provision,
    model: input.modelLabel,
    generatedAt: new Date().toISOString(),
  }

  if (candidates.length === 0) {
    return {
      ...base,
      summary: 'No open run cites this instrument, so no incident is affected.',
      findings: [],
      deadlineChanges: [],
      unaffectedRunIds: input.cases.map((openCase) => openCase.runId),
    }
  }

  const prompt = buildImpactPrompt(input.provision, candidates)
  const parse = (raw: string) => parseImpact(raw, candidates.map((openCase) => openCase.runId))
  const interpret: (userPrompt: string) => Promise<string> =
    input.deps?.interpret ?? ((userPrompt) => interpretImpact(input, userPrompt))

  let reason = 'the impact analysis did not return JSON.'
  for (let attempt = 1; attempt <= (input.attempts ?? 2); attempt += 1) {
    const raw = await interpret(
      attempt === 1
        ? prompt
        : `${prompt}\n\nYour previous reply was rejected (${reason}). Reply again with ONLY the JSON object, no prose and no code fence.`,
    )
    try {
      return { ...base, ...parse(raw) }
    } catch (error) {
      reason = (error as Error).message
    }
  }

  throw new Error(reason)
}
