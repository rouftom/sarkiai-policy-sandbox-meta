/**
 * N8 · table-top crisis exercise.
 *
 * A scenario is a script; an exercise adds a clock and a team. Injects are
 * released at fixed minutes, participants record the actions they take, and the
 * after-action report is derived from that log · deterministic first, narrative
 * second. The model writes the prose, never the facts: every metric below is
 * computed from the log, so a fluent report cannot hide a missed inject.
 */

import { generateText, type LanguageModel } from 'ai'
import type { Domain } from '@sps/shared'

export type InjectSeverity = 'low' | 'medium' | 'high' | 'critical'
export type LoggedActionKind = 'action' | 'decision' | 'escalation' | 'note'

export interface ExerciseInject {
  id: string
  /** Offset from the exercise start, in minutes. */
  atMinute: number
  title: string
  detail: string
  /** Institution ids allowed to see the inject. */
  visibleTo: string[]
  /** What a competent team is expected to do. */
  expectedAction: string
  /** Response window after release; defaults to 15 minutes. */
  responseWindowMinutes?: number
  severity?: InjectSeverity
}

export interface ExerciseDefinition {
  id: string
  title: string
  country: string
  domain: Domain
  /** Scenario run this exercise replays, when one exists. */
  scenarioRunId?: string
  durationMinutes: number
  injects: ExerciseInject[]
  /** Texts the exercise is built on, cited by the report. */
  references?: ExerciseReference[]
}

export interface ExerciseReference {
  title: string
  authority?: string
  /** Knowledge-base document id, when the reference is in the corpus. */
  documentId?: string
}

export type ReportLang = 'fr' | 'en'

export interface LoggedAction {
  id?: string
  atMinute: number
  actor: string
  kind: LoggedActionKind
  text: string
  /** Set when the action answers a specific inject. */
  injectId?: string
}

export interface AddressedInject {
  injectId: string
  title: string
  expectedAction: string
  action: string
  actor: string
  atMinute: number
  latencyMinutes: number
  withinWindow: boolean
}

export interface MissedInject {
  injectId: string
  title: string
  expectedAction: string
  releasedAtMinute: number
  reason: 'no_action' | 'late'
  latencyMinutes?: number
}

export interface ExerciseEvaluation {
  exerciseId: string
  title: string
  durationMinutes: number
  /** Cut-off used for the evaluation (minutes since start). */
  evaluatedAtMinute: number
  releasedInjects: number
  actionsLogged: number
  addressed: AddressedInject[]
  missed: MissedInject[]
  decisions: LoggedAction[]
  escalations: LoggedAction[]
  coverage: number
  averageResponseMinutes: number | null
  firstActionMinute: number | null
  gaps: string[]
}

const DEFAULT_RESPONSE_WINDOW = 15

function byMinute<T extends { atMinute: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.atMinute - b.atMinute)
}

/** Everything the room is allowed to know at `atMinute`, in release order. */
export function injectsVisibleAt(definition: DefinitionLike, atMinute: number): ExerciseInject[] {
  return definition.injects
    .filter((inject) => inject.atMinute <= atMinute)
    .sort((a, b) => a.atMinute - b.atMinute)
}

type DefinitionLike = Pick<ExerciseDefinition, 'injects'>

/** Actions that answer an inject must name it: no keyword guessing. */
function findResponse(inject: Inject, log: LoggedAction[]): LoggedAction | undefined {
  return byMinute(log).find(
    (action) =>
      action.injectId === inject.id &&
      action.atMinute >= inject.atMinute &&
      (action.kind === 'action' || action.kind === 'escalation' || action.kind === 'decision'),
  )
}

type Inject = ExerciseInject

/**
 * Evaluate a run at a given moment. Re-evaluating later is monotonic: an inject
 * can only move from missed to addressed, never back.
 */
export function evaluateExercise(
  definition: ExerciseDefinition,
  log: LoggedAction[],
  evaluatedAtMinute: number,
): ExerciseEvaluation {
  const cutoff = Math.max(0, Math.min(evaluatedAtMinute, definition.durationMinutes))
  const released = injectsVisibleAt(definition, cutoff)

  const addressed: AddressedInject[] = []
  const missed: MissedInject[] = []

  for (const inject of released) {
    const response = findResponse(inject, log)
    if (!response) {
      missed.push({
        injectId: inject.id,
        title: inject.title,
        expectedAction: inject.expectedAction,
        releasedAtMinute: inject.atMinute,
        reason: 'no_action',
      })
      continue
    }

    const window = inject.responseWindowMinutes ?? DEFAULT_RESPONSE_WINDOW
    const latencyMinutes = response.atMinute - inject.atMinute
    if (latencyMinutes > window) {
      missed.push({
        injectId: inject.id,
        title: inject.title,
        expectedAction: inject.expectedAction,
        releasedAtMinute: inject.atMinute,
        reason: 'late',
        latencyMinutes,
      })
    }
    addressed.push({
      injectId: inject.id,
      title: inject.title,
      expectedAction: inject.expectedAction,
      action: response.text,
      actor: response.actor,
      atMinute: response.atMinute,
      latencyMinutes,
      withinWindow: latencyMinutes <= window,
    })
  }

  const latencies = addressed.map((item) => item.latencyMinutes)
  const firstActionMinute = addressed.length > 0 ? Math.min(...addressed.map((item) => item.atMinute)) : null
  const gaps = missed.map((item) =>
    item.reason === 'late'
      ? `${item.injectId}: action logged ${item.latencyMinutes} min after release, outside the response window.`
      : `${item.injectId}: released at T+${item.releasedAtMinute} with no logged action by T+${cutoff}.`,
  )

  return {
    exerciseId: definition.id,
    title: definition.title,
    durationMinutes: definition.durationMinutes,
    evaluatedAtMinute: cutoff,
    releasedInjects: released.length,
    actionsLogged: log.filter((action) => action.atMinute >= 0 && action.atMinute <= cutoff).length,
    addressed,
    missed,
    decisions: byMinute(log).filter((action) => action.kind === 'decision' && action.atMinute <= cutoff),
    escalations: byMinute(log).filter((action) => action.kind === 'escalation' && action.atMinute <= cutoff),
    coverage: released.length > 0 ? addressed.filter((item) => item.withinWindow).length / released.length : 1,
    averageResponseMinutes:
      latencies.length > 0 ? Math.round((latencies.reduce((sum, value) => sum + value, 0) / latencies.length) * 10) / 10 : null,
    firstActionMinute,
    gaps,
  }
}

export interface SituationRecord {
  injectId: string
  title: string
  detail: string
  severity?: InjectSeverity
  releasedAtMinute: number
  expectedAction: string
  outcome: 'addressed' | 'late' | 'missed'
  latencyMinutes: number | null
  responders: string[]
}

export interface TeamInputGroup {
  actor: string
  entries: LoggedAction[]
}

/** The model's prose. Every figure and every list of facts is computed elsewhere. */
export interface AfterActionNarrative {
  title: string
  intro: string
  context: string
  analysis: string
  teamInputs: string
  strengths: string[]
  improvements: string[]
  recommendations: string[]
  conclusion: string
  unresolved: string[]
}

/** One row per inject released by the cut-off, with what the team did about it. */
export function buildSituations(
  definition: ExerciseDefinition,
  log: LoggedAction[],
  evaluation: ExerciseEvaluation,
): SituationRecord[] {
  return injectsVisibleAt(definition, evaluation.evaluatedAtMinute).map((inject) => {
    const addressed = evaluation.addressed.find((item) => item.injectId === inject.id)
    const missed = evaluation.missed.find((item) => item.injectId === inject.id)
    const outcome: SituationRecord['outcome'] = addressed?.withinWindow
      ? 'addressed'
      : missed?.reason === 'late'
        ? 'late'
        : 'missed'
    const responders = [
      ...new Set(
        log
          .filter((action) => action.injectId === inject.id && action.atMinute <= evaluation.evaluatedAtMinute)
          .map((action) => action.actor),
      ),
    ]
    return {
      injectId: inject.id,
      title: inject.title,
      detail: inject.detail,
      severity: inject.severity,
      releasedAtMinute: inject.atMinute,
      expectedAction: inject.expectedAction,
      outcome,
      latencyMinutes: addressed?.latencyMinutes ?? null,
      responders,
    }
  })
}

/** What each institution logged, in time order, up to the cut-off. */
export function buildTeamInputs(log: LoggedAction[], evaluatedAtMinute: number): TeamInputGroup[] {
  const groups = new Map<string, LoggedAction[]>()
  for (const action of byMinute(log)) {
    if (action.atMinute > evaluatedAtMinute) continue
    groups.set(action.actor, [...(groups.get(action.actor) ?? []), action])
  }
  return [...groups.entries()].map(([actor, entries]) => ({ actor, entries }))
}

export function buildAfterActionPrompt(
  definition: ExerciseDefinition,
  evaluation: ExerciseEvaluation,
  log: LoggedAction[] = [],
  lang: ReportLang = 'en',
): string {
  const addressed = evaluation.addressed.map(
    (item) =>
      `- ${item.injectId} (${item.title}): answered by ${item.actor} at T+${item.atMinute}, latency ${item.latencyMinutes} min, within window: ${item.withinWindow}; action: ${item.action}`,
  )
  const missed = evaluation.missed.map(
    (item) =>
      `- ${item.injectId} (${item.title}): ${item.reason}${item.latencyMinutes === undefined ? '' : `, latency ${item.latencyMinutes} min`}; expected: ${item.expectedAction}`,
  )
  const decisions = evaluation.decisions.map((item) => `- T+${item.atMinute} ${item.actor}: ${item.text}`)
  const escalations = evaluation.escalations.map((item) => `- T+${item.atMinute} ${item.actor}: ${item.text}`)
  const entries = byMinute(log)
    .filter((item) => item.atMinute <= evaluation.evaluatedAtMinute)
    .map((item) => `- T+${item.atMinute} ${item.actor} [${item.kind}]${item.injectId ? ` → ${item.injectId}` : ''}: ${item.text}`)
  const references = (definition.references ?? []).map(
    (reference) => `- ${reference.title}${reference.authority ? ` (${reference.authority})` : ''}`,
  )
  const language = lang === 'fr' ? 'French' : 'English'

  return [
    'You are the facilitator writing the after-action report of a crisis exercise.',
    `Write in ${language}.`,
    'Use only the facts below. Do not invent an action, an institution, a number, a legal deadline or a reference.',
    '',
    `EXERCISE ${definition.id} · ${definition.title} (${definition.country.toUpperCase()} · ${definition.domain})`,
    `Duration: ${definition.durationMinutes} min. Evaluated at T+${evaluation.evaluatedAtMinute}.`,
    `Coverage: ${Math.round(evaluation.coverage * 100)}% of released injects answered inside the window.`,
    `Average response: ${evaluation.averageResponseMinutes ?? 'n/a'} min. First action: ${evaluation.firstActionMinute === null ? 'none' : `T+${evaluation.firstActionMinute}`}.`,
    '',
    'ADDRESSED INJECTS',
    ...(addressed.length > 0 ? addressed : ['- (none)']),
    '',
    'MISSED OR LATE INJECTS',
    ...(missed.length > 0 ? missed : ['- (none)']),
    '',
    'DECISIONS',
    ...(decisions.length > 0 ? decisions : ['- (none)']),
    '',
    'ESCALATIONS',
    ...(escalations.length > 0 ? escalations : ['- (none)']),
    '',
    'TEAM ENTRIES (verbatim, in time order)',
    ...(entries.length > 0 ? entries : ['- (none)']),
    '',
    'REFERENCES (cite only these)',
    ...(references.length > 0 ? references : ['- (none)']),
    '',
    'Return JSON only, no prose and no code fence:',
    '{"title":"short report title","intro":"purpose and scope, one paragraph","context":"the situation the exercise simulates, one paragraph","analysis":"what the team did well and where it lagged, one paragraph","teamInputs":"how the institutions worked together, one paragraph","strengths":["..."],"improvements":["..."],"recommendations":["..."],"conclusion":"one paragraph","unresolved":["..."]}',
    'Strengths and improvements must each point to a fact above. Recommendations must be operational and testable. Keep every paragraph under 120 words.',
  ].join('\n')
}

interface RawAfterAction {
  title?: unknown
  intro?: unknown
  context?: unknown
  analysis?: unknown
  teamInputs?: unknown
  strengths?: unknown
  improvements?: unknown
  recommendations?: unknown
  conclusion?: unknown
  unresolved?: unknown
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : []
}

/** Tolerant JSON parse of the narrative; malformed output falls back to the metrics. */
export function parseAfterAction(raw: string, evaluation: ExerciseEvaluation, lang: ReportLang = 'en'): AfterActionNarrative {
  const answered = evaluation.addressed.filter((item) => item.withinWindow).length
  const fallbackIntro =
    evaluation.releasedInjects === 0
      ? lang === 'fr'
        ? 'Aucun incident n’avait été diffusé à la date du rapport.'
        : 'No inject had been released when the report was generated.'
      : lang === 'fr'
        ? `${answered}/${evaluation.releasedInjects} incidents ont reçu une réponse dans leur délai.`
        : `${answered}/${evaluation.releasedInjects} injects were answered inside their window.`
  const fallback: AfterActionNarrative = {
    title: evaluation.title,
    intro: fallbackIntro,
    context: '',
    analysis: '',
    teamInputs: '',
    strengths: [],
    improvements: [],
    recommendations: [],
    conclusion: '',
    unresolved: evaluation.missed.map((item) => item.injectId),
  }

  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return fallback

  let payload: RawAfterAction
  try {
    payload = JSON.parse(raw.slice(start, end + 1)) as RawAfterAction
  } catch {
    return fallback
  }

  return {
    title: asString(payload.title) || fallback.title,
    intro: asString(payload.intro) || fallback.intro,
    context: asString(payload.context),
    analysis: asString(payload.analysis),
    teamInputs: asString(payload.teamInputs),
    strengths: asStringArray(payload.strengths),
    improvements: asStringArray(payload.improvements),
    recommendations: asStringArray(payload.recommendations),
    conclusion: asString(payload.conclusion),
    unresolved: asStringArray(payload.unresolved),
  }
}

export interface AfterActionReport extends ExerciseEvaluation {
  narrative: AfterActionNarrative
  situations: SituationRecord[]
  teamInputs: TeamInputGroup[]
  references: ExerciseReference[]
  lang: ReportLang
  model: string
  generatedAt: string
}

export interface WriteAfterActionInput {
  model: LanguageModel
  modelLabel: string
  definition: ExerciseDefinition
  log: LoggedAction[]
  evaluatedAtMinute: number
  lang?: ReportLang
  maxOutputTokens?: number
  /** Inject a fake generator in tests. */
  deps?: { summarize?: (prompt: string) => Promise<string> }
}

export async function writeAfterAction(input: WriteAfterActionInput): Promise<AfterActionReport> {
  const lang = input.lang ?? 'en'
  const evaluation = evaluateExercise(input.definition, input.log, input.evaluatedAtMinute)
  const prompt = buildAfterActionPrompt(input.definition, evaluation, input.log, lang)

  let raw = ''
  if (input.deps?.summarize) {
    raw = await input.deps.summarize(prompt)
  } else {
    // Reasoning tokens share the output budget: a small cap leaves no visible answer.
    const result = await generateText({
      model: input.model,
      prompt,
      temperature: 0.2,
      maxOutputTokens: input.maxOutputTokens ?? 6000,
      providerOptions: { meta: { reasoningEffort: 'low' }, 'openai-compatible': { reasoningEffort: 'low' } },
    })
    raw = result.text
  }

  return {
    ...evaluation,
    narrative: parseAfterAction(raw, evaluation, lang),
    situations: buildSituations(input.definition, input.log, evaluation),
    teamInputs: buildTeamInputs(input.log, evaluation.evaluatedAtMinute),
    references: input.definition.references ?? [],
    lang,
    model: input.modelLabel,
    generatedAt: new Date().toISOString(),
  }
}
