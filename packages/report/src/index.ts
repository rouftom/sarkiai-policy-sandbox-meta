/**
 * Run dossier: the auditable evidence bundle for a scenario/assessment run.
 *
 * Bundles the hash-chained audit log, the persisted chain-of-thought traces, the
 * joint situation reports and every citation into one portable artifact (JSON or
 * Markdown) — the demo deliverable for the "auditability" evaluation criterion.
 */

import type {
  AuditRecord,
  Citation,
  CoTTrace,
  JointSituationReport,
} from '@sps/shared'

export * from './store'


export interface RunDossierInput {
  runId: string
  audit: AuditRecord[]
  traces: CoTTrace[]
  reports: JointSituationReport[]
  integrity?: { valid: boolean; brokenAt?: string }
}

export interface RunDossier extends RunDossierInput {
  generatedAt: string
  citationCount: number
  citations: Citation[]
  conflictCount: number
}

export function buildRunDossier(input: RunDossierInput): RunDossier {
  const citations = dedupeCitations(input.reports.flatMap((r) => r.citations))
  const conflictCount = input.reports.reduce((sum, r) => sum + r.conflicts.length, 0)
  return {
    ...input,
    generatedAt: new Date().toISOString(),
    citationCount: citations.length,
    citations,
    conflictCount,
  }
}

function citationKey(c: Citation): string {
  return [c.country, c.filename, c.articleNumber ?? '', c.headingPath ?? ''].join('|')
}

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Map<string, Citation>()
  for (const citation of citations) seen.set(citationKey(citation), citation)
  return [...seen.values()]
}

function integrityBadge(integrity?: { valid: boolean; brokenAt?: string }): string {
  if (!integrity) return 'non vérifiée'
  return integrity.valid ? '✅ chaîne d’audit intègre' : `❌ chaîne rompue à ${integrity.brokenAt}`
}

export function renderDossierMarkdown(dossier: RunDossier): string {
  const lines: string[] = [
    `# Dossier de run — ${dossier.runId}`,
    '',
    `_Généré le ${dossier.generatedAt} · Intégrité : ${integrityBadge(dossier.integrity)}_`,
    '',
    `- Rapports conjoints : **${dossier.reports.length}**`,
    `- Conflits de mandats : **${dossier.conflictCount}**`,
    `- Citations uniques : **${dossier.citationCount}**`,
    `- Étapes de raisonnement (CoT) : **${dossier.traces.length}**`,
    `- Enregistrements d'audit : **${dossier.audit.length}**`,
    '',
  ]

  for (const report of dossier.reports) {
    lines.push(`## Tick ${report.tick} — ${report.summary}`, '')

    if (report.agreements.length) {
      lines.push('### Accords')
      lines.push(...report.agreements.map((a) => `- ${a}`), '')
    }

    if (report.conflicts.length) {
      lines.push('### Conflits de mandats')
      for (const conflict of report.conflicts) {
        lines.push(`- **[${conflict.severity}] ${conflict.between.join(' ↔ ')}** — ${conflict.summary}`)
        for (const position of conflict.positions) lines.push(`  - _${position.agentId}_ : ${position.position}`)
      }
      lines.push('')
    }

    if (report.openQuestions.length) {
      lines.push('### Questions ouvertes')
      lines.push(...report.openQuestions.map((q) => `- ${q}`), '')
    }

    lines.push('### Évaluations par agent')
    for (const assessment of report.assessments) {
      lines.push(`- **${assessment.agentId}** (confiance ${assessment.confidence}) — ${assessment.findings.join(' ')}`)
    }
    lines.push('')
  }

  if (dossier.citations.length) {
    lines.push('## Sources citées', '')
    dossier.citations.forEach((c, i) => {
      const label = [c.filename, c.articleNumber ? `ARTICLE ${c.articleNumber}` : '', c.headingPath ?? '']
        .filter(Boolean)
        .join(' · ')
      lines.push(`${i + 1}. **${c.country.toUpperCase()} — ${label}** — « ${c.quote} »`)
    })
    lines.push('')
  }

  lines.push('## Piste de raisonnement (CoT)', '')
  for (const trace of dossier.traces) {
    lines.push(`- \`${trace.agentId}\` étape ${trace.step} — ${trace.thought.slice(0, 300)}`)
  }
  lines.push('')

  return lines.join('\n')
}
