import { describe, expect, test } from 'bun:test'
import { buildScenarioExport } from './scenario-report'
import type { ScenarioRunRecord } from './scenario-runs'
import type { CoTTrace, JointSituationReport } from '@sps/shared'

const report: JointSituationReport = {
  runId: 'run-1',
  tick: 0,
  domain: 'health',
  country: 'cm',
  summary: 'Une fuite de données est confirmée.',
  agreements: ['Notifier l’autorité sous 72 heures.'],
  conflicts: [
    {
      id: 'c1',
      between: ['ministry_health', 'data_authority'],
      summary: 'Désaccord sur le délai.',
      positions: [{ agentId: 'ministry_health', position: 'Attendre la qualification.' }],
      citations: [],
      severity: 'high',
    },
  ],
  openQuestions: ['Qui communique publiquement ?'],
  gaps: [],
  citations: [],
  assessments: [
    {
      agentId: 'health_agency',
      role: 'institutional',
      mandate: 'Protect health data',
      domain: 'health',
      findings: ['La violation est avérée.'],
      confidence: 0.8,
      cotTraceId: 'run-1:health_agency',
      gaps: [],
      citations: [
        {
          country: 'cm',
          docType: 'law',
          filename: 'loi-sante.pdf',
          articleNumber: '12',
          quote: 'Toute violation doit être notifiée.',
        },
      ],
      webSources: [{ title: 'CNIL · notification', url: 'https://cnil.fr/notification', snippet: '72 heures.' }],
    },
  ],
  generatedAt: '2026-10-29T10:00:00Z',
}

const trace: CoTTrace = {
  id: 't1',
  runId: 'run-1',
  agentId: 'health_agency',
  step: 0,
  thought: 'Retrieved one provision.',
  toolCalls: [],
  model: 'muse-spark',
  ts: '2026-10-29T10:00:00Z',
}

const run: ScenarioRunRecord = {
  id: 'run-1',
  userId: 'op',
  country: 'cm',
  domain: 'health',
  lang: 'fr',
  title: 'Fuite de données de santé',
  createdAt: '2026-10-29T10:00:00Z',
  updatedAt: '2026-10-29T10:02:00Z',
  status: 'complete',
  released: 1,
  total: 1,
  reports: [report],
}

describe('scenario export', () => {
  test('JSON carries the run, the reports, the sources and the traces', async () => {
    const file = await buildScenarioExport({ run, traces: [trace], format: 'json' })
    expect(file.filename).toBe('scenario-run-1.json')
    expect(file.encoding).toBe('utf8')
    const body = JSON.parse(file.content)
    expect(body.run.id).toBe('run-1')
    expect(body.reports).toHaveLength(1)
    expect(body.citations[0].filename).toBe('loi-sante.pdf')
    expect(body.webSources[0].url).toBe('https://cnil.fr/notification')
    expect(body.traces[0].thought).toBe('Retrieved one provision.')
  })

  test('Markdown follows the language of the run and includes every section', async () => {
    const file = await buildScenarioExport({ run, traces: [trace], format: 'markdown' })
    expect(file.filename).toBe('scenario-run-1.md')
    expect(file.content).toContain('# Fuite de données de santé')
    expect(file.content).toContain('## Bloc 1 · Une fuite de données est confirmée.')
    expect(file.content).toContain('### Conflits de mandats')
    expect(file.content).toContain('#### health_agency · confiance 0.8')
    expect(file.content).toContain('## Sources citées')
    expect(file.content).toContain('## Sources web')
    expect(file.content).toContain('## Piste de raisonnement (CoT)')
    expect(file.content).toContain('Retrieved one provision.')
  })

  test('the English run gets English labels', async () => {
    const file = await buildScenarioExport({
      run: { ...run, lang: 'en', title: 'Health-data breach' },
      traces: [],
      format: 'markdown',
    })
    expect(file.content).toContain('# Health-data breach')
    expect(file.content).toContain('## Batch 1')
    expect(file.content).toContain('### Mandate conflicts')
  })

  test('HTML is a self-contained page with escaped text and linked sources', async () => {
    const file = await buildScenarioExport({
      run: { ...run, title: 'Fuite <script>alert(1)</script>' },
      traces: [trace],
      format: 'html',
    })
    expect(file.filename).toBe('scenario-run-1.html')
    expect(file.content.startsWith('<!doctype html>')).toBe(true)
    expect(file.content).toContain('&lt;script&gt;')
    expect(file.content).not.toContain('<script>alert(1)</script>')
    expect(file.content).toContain('href="https://cnil.fr/notification"')
    expect(file.content).toContain('Piste de raisonnement (CoT)')
  })

  test('Word needs the docx server, and reports its absence instead of returning bytes', async () => {
    await expect(buildScenarioExport({ run, traces: [], format: 'docx' })).rejects.toThrow(
      'Word generation failed',
    )
  })
})
