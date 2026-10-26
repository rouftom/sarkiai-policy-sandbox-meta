import { describe, expect, test } from 'bun:test'
import type { Citation, JointSituationReport } from '@sps/shared'
import { buildRunDossier, renderDossierMarkdown } from './index'

const citation: Citation = {
  country: 'cm',
  docType: 'law',
  filename: 'loi_2024_protection_donnees.pdf',
  articleNumber: '12',
  headingPath: 'TITRE I > ARTICLE 12',
  quote: 'Tout traitement doit être licite.',
}

const report: JointSituationReport = {
  runId: 'run-1',
  tick: 0,
  domain: 'health',
  country: 'cm',
  assessments: [
    {
      agentId: 'ministry_health',
      role: 'institutional',
      mandate: 'continuity of care',
      domain: 'health',
      findings: ['Le ministère doit assurer la continuité des soins.'],
      citations: [citation],
      gaps: [],
      confidence: 0.8,
      cotTraceId: 'run-1:ministry_health',
    },
  ],
  agreements: ['La notification est requise.'],
  conflicts: [
    {
      id: 'run-1-t0-c0',
      between: ['ministry_health', 'data_protection_authority'],
      summary: 'Notification immédiate vs continuité des soins',
      positions: [
        { agentId: 'ministry_health', position: 'Différer la communication' },
        { agentId: 'data_protection_authority', position: 'Notifier sous 72h' },
      ],
      severity: 'high',
      citations: [],
    },
  ],
  openQuestions: ['Qui est l’autorité chef de file ?'],
  gaps: [],
  citations: [citation],
  summary: 'Situation tendue.',
  generatedAt: '2026-10-03T00:00:00.000Z',
}

describe('run dossier', () => {
  test('buildRunDossier dedupes citations and counts conflicts', () => {
    const dossier = buildRunDossier({ runId: 'run-1', audit: [], traces: [], reports: [report, report] })
    expect(dossier.citationCount).toBe(1)
    expect(dossier.conflictCount).toBe(2)
    expect(dossier.citations).toHaveLength(1)
  })

  test('renderDossierMarkdown includes run id, sources and conflict details', () => {
    const dossier = buildRunDossier({ runId: 'run-1', audit: [], traces: [], reports: [report] })
    const md = renderDossierMarkdown(dossier)
    expect(md).toContain('run-1')
    expect(md).toContain('Sources')
    expect(md).toContain('ARTICLE 12')
    expect(md).toContain('Conflits de mandats')
    expect(md).toContain('high')
  })
})
