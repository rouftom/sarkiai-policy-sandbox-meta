import { describe, expect, test } from 'bun:test'
import type { AfterActionDto } from './api'
import { buildReportModel, reportFilename, toHtml, toMarkdown } from './after-action-export'

const label = (key: string) => key as never

function report(overrides: Partial<AfterActionDto> = {}): AfterActionDto {
  return {
    exerciseId: 'health-breach-drill',
    title: 'Health-data breach table-top drill',
    durationMinutes: 120,
    evaluatedAtMinute: 60,
    releasedInjects: 2,
    actionsLogged: 2,
    addressed: [
      {
        injectId: 'inj-1',
        title: 'Anomalous access',
        expectedAction: 'Open an incident.',
        action: 'Ticket opened.',
        actor: 'cyber_agency',
        atMinute: 8,
        latencyMinutes: 8,
        withinWindow: true,
      },
    ],
    missed: [{ injectId: 'inj-2', title: 'Scope widens', expectedAction: 'Notify.', releasedAtMinute: 20, reason: 'no_action' }],
    decisions: [],
    escalations: [],
    coverage: 0.5,
    averageResponseMinutes: 8,
    firstActionMinute: 8,
    gaps: [],
    narrative: {
      title: 'Breach drill: the first fifteen minutes',
      intro: 'The team opened the incident quickly.',
      context: '',
      analysis: 'Scope was not assessed before the second inject.',
      teamInputs: '',
      strengths: ['The cyber agency was paged early.'],
      improvements: ['Assess scope at T+20.'],
      recommendations: [],
      conclusion: '',
      unresolved: ['inj-2'],
    },
    situations: [
      {
        injectId: 'inj-1',
        title: 'Anomalous access',
        detail: 'A service account reads records.',
        severity: 'high',
        releasedAtMinute: 0,
        expectedAction: 'Open an incident.',
        outcome: 'addressed',
        latencyMinutes: 8,
        responders: ['cyber_agency'],
      },
    ],
    teamInputs: [
      {
        actor: 'cyber_agency',
        entries: [{ atMinute: 8, actor: 'cyber_agency', kind: 'action', text: 'Ticket opened.', injectId: 'inj-1' }],
      },
    ],
    references: [{ title: 'Loi relative à la protection des données', authority: 'Présidence' }],
    images: [
      { id: 'context', caption: 'Exercise context', mime: 'image/png', dataBase64: 'AAAA', source: 'meta-image', model: 'muse-image-1.0' },
      { id: 'timeline', caption: 'Incident timeline', mime: 'image/svg+xml', dataBase64: 'BBBB', source: 'sample', model: 'local-sample' },
    ],
    lang: 'en',
    model: 'muse-spark-1.3',
    generatedAt: '2026-10-30T10:00:00.000Z',
    ...overrides,
  }
}

describe('after-action export', () => {
  test('markdown carries the report sections, the figures and the sources', () => {
    const markdown = toMarkdown(report(), label)
    expect(markdown.startsWith('# Breach drill: the first fifteen minutes')).toBe(true)
    expect(markdown).toContain('## exercise.report.intro')
    expect(markdown).toContain('- **cyber_agency · T+8 [action] → inj-1**: Ticket opened.')
    expect(markdown).toContain('data:image/png;base64,AAAA')
    expect(markdown).toContain('data:image/svg+xml;base64,BBBB')
    expect(markdown).toContain('Loi relative à la protection des données · Présidence')
  })

  test('empty prose sections are left out', () => {
    const markdown = toMarkdown(report(), label)
    expect(markdown).not.toContain('## exercise.report.conclusion')
    expect(markdown).not.toContain('## exercise.report.context')
    expect(markdown).not.toContain('## exercise.report.recommendations')
  })

  test('the HTML page escapes model text and embeds the figures', () => {
    const html = toHtml(
      report({ narrative: { ...report().narrative, intro: '<script>alert(1)</script> opened' } }),
      label,
    )
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; opened')
    expect(html).toContain('<img src="data:image/png;base64,AAAA"')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('@page')
  })

  test('the model keeps the same sections for screen and files', () => {
    const model = buildReportModel(report(), label)
    expect(model.cover?.id).toBe('context')
    expect(model.sections.find((section) => section.heading === 'exercise.report.situations')?.image?.id).toBe('timeline')
    expect(model.sections.find((section) => section.heading === 'exercise.report.situations')?.table?.rows[0]?.[2]).toBe(
      'exercise.outcome.addressed',
    )
  })

  test('file names are slugs of the report title, without accents', () => {
    expect(reportFilename(report(), 'pdf')).toBe('breach-drill-the-first-fifteen-minutes.pdf')
    expect(reportFilename(report({ narrative: { ...report().narrative, title: 'Rapport é' } }), 'md')).toBe('rapport-e.md')
  })

  test('an older report without the new sections still renders', () => {
    const legacy = {
      ...report(),
      narrative: { summary: 'Old summary.', lessons: [], recommendations: ['Test scope.'], unresolved: [] },
      situations: undefined,
      teamInputs: undefined,
      references: undefined,
      images: undefined,
    } as unknown as AfterActionDto
    const markdown = toMarkdown(legacy, label)
    expect(markdown).toContain('Old summary.')
    expect(markdown).toContain('Test scope.')
    expect(toHtml(legacy, label)).toContain('<html')
  })
})
