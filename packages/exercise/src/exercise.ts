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
}

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

export function buildAfterActionPrompt(definition: ExerciseDefinition, evaluation: ExerciseEvaluation): string {
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

  return [
    'You are the facilitator writing the after-action report of a crisis exercise.',
    'Use only the facts below. Do not invent an action, an institution, a number or a legal deadline.',
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
    'Return JSON only, no prose and no code fence:',
    '{"summary":"one paragraph","lessons":["..."],"recommendations":["..."],"unresolved":["..."]}',
    'Lessons must point to a fact above. Recommendations must be operational and testable.',
  ].join('\n')
}

interface RawAfterAction {
  summary?: unknown
  lessons?: unknown
  recommendations?: unknown
  unresolved?: unknown
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : []
}

export interface AfterActionNarrative {
  summary: string
  lessons: string[]
  recommendations: string[]
  unresolved: string[]
}

/** Tolerant JSON parse of the narrative; malformed output falls back to the metrics. */
export function parseAfterAction(raw: string, evaluation: ExerciseEvaluation): AfterActionNarrative {
  const fallback: AfterActionNarrative = {
    summary:
      evaluation.releasedInjects === 0
        ? 'No inject had been released when the report was generated.'
        : `${evaluation.addressed.filter((item) => item.withinWindow).length}/${evaluation.releasedInjects} injects were answered inside their window.`,
    lessons: [],
    recommendations: [],
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
    summary: asString(payload.summary) || fallback.summary,
    lessons: asStringArray(payload.lessons),
    recommendations: asStringArray(payload.recommendations),
    unresolved: asStringArray(payload.unresolved),
  }
}

export interface AfterActionReport extends ExerciseEvaluation {
  narrative: AfterActionNarrative
  model: string
  generatedAt: string
}

export interface WriteAfterActionInput {
  model: LanguageModel
  modelLabel: string
  definition: ExerciseDefinition
  log: LoggedAction[]
  evaluatedAtMinute: number
  maxOutputTokens?: number
  /** Inject a fake generator in tests. */
  deps?: { summarize?: (prompt: string) => Promise<string> }
}

export async function writeAfterAction(input: WriteAfterActionInput): Promise<AfterActionReport> {
  const evaluation = evaluateExercise(input.definition, input.log, input.evaluatedAtMinute)
  const prompt = buildAfterActionPrompt(input.definition, evaluation)

  let raw = ''
  if (input.deps?.summarize) {
    raw = await input.deps.summarize(prompt)
  } else {
    const result = await generateText({
      model: input.model,
      prompt,
      temperature: 0.2,
      maxOutputTokens: input.maxOutputTokens ?? 1200,
    })
    raw = result.text
  }

  return {
    ...evaluation,
    narrative: parseAfterAction(raw, evaluation),
    model: input.modelLabel,
    generatedAt: new Date().toISOString(),
  }
}
