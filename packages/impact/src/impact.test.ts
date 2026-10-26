import { describe, expect, test } from 'bun:test'
import type { LanguageModel } from 'ai'
import { analyzeImpact, buildImpactPrompt, matchAffected, normalizeArticle, parseImpact, type OpenCase } from './impact.js'

function openCase(overrides: Partial<OpenCase> = {}): OpenCase {
  return {
    runId: 'run-1',
    country: 'cm',
    domain: 'health',
    reports: 2,
    citations: [
      {
        country: 'cm',
        docType: 'regulation',
        filename: 'decret-2026-341.pdf',
        articleNumber: 'ARTICLE 2',
        quote: 'Le responsable du traitement notifie dans un délai de soixante-douze heures.',
      },
    ],
    facts: ['A nurse reports unauthorised access to a shared drive.'],
    ...overrides,
  }
}

describe('candidate matching', () => {
  test('normalises the forms a gazette prints', () => {
    expect(normalizeArticle('ARTICLE 12 bis')).toBe('12 bis')
    expect(normalizeArticle('Art. 9')).toBe('9')
    expect(normalizeArticle(undefined)).toBe('')
  })

  test('keeps a run that cites the same article of the same instrument', () => {
    const provision = { title: 'Decret 2026/341', articleNumber: 'Article 2', text: '...' }
    expect(matchAffected([openCase()], provision).map((c) => c.runId)).toEqual(['run-1'])
  })

  test('drops a run citing the same article of another instrument', () => {
    const provision = { title: 'Loi 2010/012 cybersecurite', articleNumber: 'ARTICLE 2', text: '...' }
    expect(matchAffected([openCase()], provision)).toEqual([])
  })

  test('an unnumbered provision makes every run a candidate', () => {
    const provision = { title: 'Stratégie nationale IA 2027', text: '...' }
    const cases = [openCase(), openCase({ runId: 'run-2' })]
    expect(matchAffected(cases, provision).map((c) => c.runId)).toEqual(['run-1', 'run-2'])
  })
})

describe('prompt', () => {
  test('states the run ids, the facts and the JSON contract', () => {
    const prompt = buildImpactPrompt(
      { title: 'Decret 2026/341', articleNumber: 'ARTICLE 2', text: 'Nouveau délai de 48 heures.' },
      [openCase()],
    )
    expect(prompt).toContain('RUN run-1')
    expect(prompt).toContain('soixante-douze heures')
    expect(prompt).toContain('unauthorised access')
    expect(prompt).toContain('Return JSON only')
  })
})

describe('parsing', () => {
  test('tolerates a code fence and keeps known runs only', () => {
    const raw = [
      '```json',
      JSON.stringify({
        summary: 'The deadline drops to 48 hours.',
        findings: [
          { runId: 'run-1', severity: 'high', reason: 'Deadline changes.', affectedArticles: ['ARTICLE 2'], action: 'Re-run tick 3.' },
          { runId: 'ghost', severity: 'critical', reason: 'Invented case.', affectedArticles: ['ARTICLE 99'], action: 'None.' },
        ],
        deadlineChanges: ['72h → 48h'],
        unaffectedRunIds: ['run-1', 'run-9'],
      }),
      '```',
    ].join('\n')

    const parsed = parseImpact(raw, ['run-1'])
    expect(parsed.findings).toHaveLength(1)
    expect(parsed.findings[0]?.severity).toBe('high')
    expect(parsed.deadlineChanges).toEqual(['72h → 48h'])
    expect(parsed.unaffectedRunIds).toEqual(['run-1'])
  })

  test('falls back to medium for an unknown severity and rejects garbage', () => {
    const parsed = parseImpact('{"get":1,"findings":[{"runId":"run-1","severity":"apocalyptic"}]}', ['run-1'])
    expect(parsed.findings[0]?.severity).toBe('medium')
    expect(() => parseImpact('no json here', ['run-1'])).toThrow(/did not return JSON/)
  })
})

describe('analyzeImpact', () => {
  test('does not call the model when no run cites the instrument', async () => {
    let called = false
    const analysis = await analyzeImpact({
      model: {} as LanguageModel,
      modelLabel: 'muse-spark-1.3',
      provision: { title: 'Loi 2010/012', articleNumber: 'ARTICLE 2', text: '...' },
      cases: [openCase()],
      deps: {
        interpret: async () => {
          called = true
          return '{}'
        },
      },
    })
    expect(called).toBe(false)
    expect(analysis.findings).toEqual([])
    expect(analysis.unaffectedRunIds).toEqual(['run-1'])
    expect(analysis.summary).toContain('No open run')
  })

  test('returns ranked findings for the candidates', async () => {
    const analysis = await analyzeImpact({
      model: {} as LanguageModel,
      modelLabel: 'muse-spark-1.3',
      provision: { title: 'Decret 2026/341', articleNumber: 'ARTICLE 2', text: 'Délai de 48 heures.', effectiveDate: '2026-11-01' },
      cases: [openCase(), openCase({ runId: 'run-2', citations: [] })],
      deps: {
        interpret: async (prompt) => {
          expect(prompt).not.toContain('RUN run-2')
          return JSON.stringify({
            summary: 'Deadline tightened.',
            findings: [
              { runId: 'run-1', severity: 'critical', reason: '48h', affectedArticles: ['ARTICLE 2'], action: 'Re-run notification.' },
            ],
            deadlineChanges: ['72h → 48h'],
          })
        },
      },
    })
    expect(analysis.findings[0]?.runId).toBe('run-1')
    expect(analysis.findings[0]?.severity).toBe('critical')
    expect(analysis.provision.effectiveDate).toBe('2026-11-01')
    expect(analysis.model).toBe('muse-spark-1.3')
  })
})
