import { describe, expect, test } from 'bun:test'
import type { LanguageModel } from 'ai'
import {
  buildAfterActionPrompt,
  buildSituations,
  buildTeamInputs,
  evaluateExercise,
  injectsVisibleAt,
  parseAfterAction,
  writeAfterAction,
  type ExerciseDefinition,
  type LoggedAction,
} from './exercise.js'

const definition: ExerciseDefinition = {
  id: 'breach-drill',
  title: 'Health-data breach drill',
  country: 'cm',
  domain: 'health',
  scenarioRunId: 'health-data-breach',
  durationMinutes: 120,
  injects: [
    {
      id: 'inj-1',
      atMinute: 0,
      title: 'Anomalous access',
      detail: 'The SIEM flags a service account reading patient records.',
      visibleTo: ['ministry_health', 'cyber_agency'],
      expectedAction: 'Open an incident and notify the cyber agency.',
      responseWindowMinutes: 15,
      severity: 'high',
    },
    {
      id: 'inj-2',
      atMinute: 30,
      title: 'Data leaves the network',
      detail: 'A 4 GB transfer is seen to an external host.',
      visibleTo: ['cyber_agency', 'data_protection_authority'],
      expectedAction: 'Escalate to the data-protection authority.',
      responseWindowMinutes: 20,
      severity: 'critical',
    },
    {
      id: 'inj-3',
      atMinute: 60,
      title: 'Press call',
      detail: 'A journalist asks for a statement.',
      visibleTo: ['ministry_health', 'coordinator'],
      expectedAction: 'Route the request to the communication cell.',
      responseWindowMinutes: 10,
    },
  ],
}

describe('inject release', () => {
  test('only exposes injects whose time has come', () => {
    expect(injectsVisibleAt(definition, 0).map((inject) => inject.id)).toEqual(['inj-1'])
    expect(injectsVisibleAt(definition, 30).map((inject) => inject.id)).toEqual(['inj-1', 'inj-2'])
    expect(injectsVisibleAt(definition, 59).map((inject) => inject.id)).toEqual(['inj-1', 'inj-2'])
    expect(injectsVisibleAt(definition, 60).map((inject) => inject.id)).toEqual(['inj-1', 'inj-2', 'inj-3'])
  })
})

describe('exercise evaluation', () => {
  const log: LoggedAction[] = [
    {
      atMinute: 8,
      actor: 'cyber_agency',
      kind: 'action',
      injectId: 'inj-1',
      text: 'Incident ticket opened; agency paged.',
    },
    {
      atMinute: 55,
      actor: 'data_protection_authority',
      kind: 'escalation',
      injectId: 'inj-2',
      text: 'Authority notified.',
    },
    {
      atMinute: 70,
      actor: 'ministry_health',
      kind: 'decision',
      text: 'No public statement before the facts are confirmed.',
    },
  ]

  test('separates addressed, late and unaddressed injects', () => {
    const evaluation = evaluateExercise(definition, log, 90)
    expect(evaluation.releasedInjects).toBe(3)
    expect(evaluation.addressed.map((item) => item.injectId)).toEqual(['inj-1', 'inj-2'])
    expect(evaluation.addressed[0]?.withinWindow).toBe(true)
    expect(evaluation.addressed[1]?.withinWindow).toBe(false)
    expect(evaluation.missed.map((item) => [item.injectId, item.reason])).toEqual([
      ['inj-2', 'late'],
      ['inj-3', 'no_action'],
    ])
    expect(evaluation.coverage).toBeCloseTo(1 / 3, 5)
    expect(evaluation.averageResponseMinutes).toBe(16.5)
    expect(evaluation.firstActionMinute).toBe(8)
    expect(evaluation.decisions).toHaveLength(1)
    expect(evaluation.escalations).toHaveLength(1)
    expect(evaluation.gaps).toHaveLength(2)
  })

  test('evaluation is capped by the exercise duration and ignores later entries', () => {
    const evaluation = evaluateExercise(definition, log, 240)
    expect(evaluation.evaluatedAtMinute).toBe(120)
    expect(evaluation.actionsLogged).toBe(3)
    expect(evaluation.missed.some((item) => item.injectId === 'inj-3')).toBe(true)
  })

  test('an action before the inject does not count', () => {
    const early = evaluateExercise(
      definition,
      [{ atMinute: 2, actor: 'cyber_agency', kind: 'action', injectId: 'inj-2', text: 'pre-emptive' }],
      120,
    )
    expect(early.missed.some((item) => item.injectId === 'inj-2')).toBe(true)
  })
})

describe('after-action report', () => {
  const log: LoggedAction[] = [
    { atMinute: 10, actor: 'cyber_agency', kind: 'action', injectId: 'inj-1', text: 'Ticket opened.' },
  ]

  test('the prompt carries only computed facts', () => {
    const single: ExerciseDefinition = { ...definition, injects: [definition.injects[0]!] }
    const prompt = buildAfterActionPrompt(single, evaluateExercise(single, log, 30), log)
    expect(prompt).toContain('Coverage: 100%')
    expect(prompt).toContain('inj-1')
    expect(prompt).toContain('Ticket opened.')
    expect(prompt).toContain('Return JSON only')
  })

  test('parses the narrative with an injected generator', async () => {
    const report = await writeAfterAction({
      model: {} as LanguageModel,
      modelLabel: 'muse-spark-1.3',
      definition,
      log,
      evaluatedAtMinute: 30,
      deps: {
        summarize: async (prompt) => {
          expect(prompt).toContain('inj-1')
          return JSON.stringify({
            title: 'Health breach drill',
            intro: 'The team opened the incident quickly.',
            strengths: ['The cyber agency was paged before scope was known.'],
            recommendations: ['Add a 5-minute scope checkpoint.'],
            unresolved: ['inj-2', 'inj-3'],
          })
        },
      },
    })
    expect(report.narrative.intro).toContain('opened the incident')
    expect(report.narrative.recommendations).toHaveLength(1)
    expect(report.situations.map((item) => item.outcome)).toEqual(['addressed', 'missed'])
    expect(report.teamInputs[0]?.actor).toBe('cyber_agency')
    expect(report.model).toBe('muse-spark-1.3')
    expect(report.generatedAt).toBeTruthy()
  })

  test('falls back to the metrics when the model returns garbage', () => {
    const evaluation = evaluateExercise(definition, log, 30)
    const narrative = parseAfterAction('not json', evaluation)
    expect(narrative.intro).toContain('1/2 injects')
    expect(narrative.unresolved).toEqual(['inj-2'])
  })
})

describe('report sections', () => {
  const log: LoggedAction[] = [
    { atMinute: 10, actor: 'cyber_agency', kind: 'action', injectId: 'inj-1', text: 'Ticket opened.' },
    { atMinute: 12, actor: 'ministry_health', kind: 'note', text: 'Briefing scheduled.' },
    { atMinute: 55, actor: 'cyber_agency', kind: 'action', injectId: 'inj-2', text: 'Too late.' },
  ]

  test('situations classify each released inject as addressed, late or missed', () => {
    const evaluation = evaluateExercise(definition, log, 60)
    const situations = buildSituations(definition, log, evaluation)
    expect(situations.map((item) => [item.injectId, item.outcome])).toEqual([
      ['inj-1', 'addressed'],
      ['inj-2', 'late'],
      ['inj-3', 'missed'],
    ])
    expect(situations[0]?.responders).toEqual(['cyber_agency'])
    expect(situations[1]?.latencyMinutes).toBe(25)
  })

  test('team inputs are grouped by institution, in time order, up to the cut-off', () => {
    const groups = buildTeamInputs(log, 15)
    expect(groups.map((group) => group.actor)).toEqual(['cyber_agency', 'ministry_health'])
    expect(groups[0]?.entries).toHaveLength(1)
  })

  test('the French prompt asks for French prose', () => {
    const evaluation = evaluateExercise(definition, log, 60)
    expect(buildAfterActionPrompt(definition, evaluation, log, 'fr')).toContain('Write in French.')
  })
})
