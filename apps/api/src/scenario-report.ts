/**
 * Export of one scenario run: the joint reports of every batch, the sources the
 * agents cited, and the chain-of-thought trail kept by the audit service.
 *
 * One structure feeds the four formats: JSON (the raw artifact), Markdown, a
 * self-contained HTML page, and a Word file built by the docx MCP server. The
 * labels follow the language of the run, not the language of the console that
 * asks for the export.
 */

import { callMcpTool } from './mcp-tool.js'
import type { McpGateway } from './mcp.js'
import type { ScenarioRunRecord } from './scenario-runs.js'
import type { Citation, CoTTrace, Domain } from '@sps/shared'

export type ScenarioExportFormat = 'json' | 'markdown' | 'html' | 'docx'

export interface ScenarioExportFile {
  filename: string
  mime: string
  /** Text for JSON, Markdown and HTML; base64 bytes for Word. */
  content: string
  encoding: 'utf8' | 'base64'
}

interface Labels {
  generated: string
  country: string
  sector: string
  status: string
  progress: string
  batch: string
  agreements: string
  conflicts: string
  openQuestions: string
  assessments: string
  sources: string
  webSources: string
  cot: string
  step: string
  confidence: string
  statuses: Record<ScenarioRunRecord['status'], string>
}

const LABELS: Record<'en' | 'fr', Labels> = {
  en: {
    generated: 'Generated',
    country: 'Country',
    sector: 'Sector',
    status: 'Status',
    progress: 'Progress',
    batch: 'Batch',
    agreements: 'Agreements',
    conflicts: 'Mandate conflicts',
    openQuestions: 'Open questions',
    assessments: 'Assessments',
    sources: 'Sources cited',
    webSources: 'Web sources',
    cot: 'Reasoning trail (CoT)',
    step: 'Step',
    confidence: 'confidence',
    statuses: { running: 'Running', complete: 'Finished', failed: 'Failed' },
  },
  fr: {
    generated: 'Généré le',
    country: 'Pays',
    sector: 'Secteur',
    status: 'Statut',
    progress: 'Progression',
    batch: 'Bloc',
    agreements: 'Accords',
    conflicts: 'Conflits de mandats',
    openQuestions: 'Questions ouvertes',
    assessments: 'Évaluations',
    sources: 'Sources citées',
    webSources: 'Sources web',
    cot: 'Piste de raisonnement (CoT)',
    step: 'Étape',
    confidence: 'confiance',
    statuses: { running: 'En cours', complete: 'Terminé', failed: 'Échec' },
  },
}

const SECTORS: Record<Domain, { en: string; fr: string }> = {
  health: { en: 'Health', fr: 'Santé' },
  education: { en: 'Education', fr: 'Éducation' },
  telecom: { en: 'Telecom', fr: 'Télécoms' },
  public_services: { en: 'Public services', fr: 'Services publics' },
  agriculture: { en: 'Agriculture', fr: 'Agriculture' },
}

function labelsOf(run: ScenarioRunRecord): Labels {
  return LABELS[run.lang === 'fr' ? 'fr' : 'en']
}

function sectorLabel(run: ScenarioRunRecord): string {
  const sector = SECTORS[run.domain as Domain]
  return sector ? sector[run.lang === 'fr' ? 'fr' : 'en'] : run.domain.replace(/_/g, ' ')
}

function citationKey(citation: Citation): string {
  return [citation.country, citation.filename, citation.articleNumber ?? '', citation.headingPath ?? ''].join('|')
}

function citationsOf(run: ScenarioRunRecord): Citation[] {
  const seen = new Map<string, Citation>()
  for (const report of run.reports) {
    for (const assessment of report.assessments) {
      for (const citation of assessment.citations ?? []) seen.set(citationKey(citation), citation)
    }
  }
  return [...seen.values()]
}

function webSourcesOf(run: ScenarioRunRecord): Array<{ title: string; url: string; snippet?: string }> {
  const seen = new Map<string, { title: string; url: string; snippet?: string }>()
  for (const report of run.reports) {
    for (const assessment of report.assessments) {
      for (const source of assessment.webSources ?? []) seen.set(source.url, source)
    }
  }
  return [...seen.values()]
}

function citationLabel(citation: Citation): string {
  return [
    citation.country.toUpperCase(),
    citation.filename,
    citation.articleNumber ? `ARTICLE ${citation.articleNumber}` : '',
    citation.headingPath ?? '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Agent id → its steps, in the order the agents first appear. */
function groupTraces(traces: CoTTrace[]): Array<[string, CoTTrace[]]> {
  const groups = new Map<string, CoTTrace[]>()
  for (const trace of traces) {
    const list = groups.get(trace.agentId) ?? []
    list.push(trace)
    groups.set(trace.agentId, list)
  }
  return [...groups.entries()]
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function headerOf(run: ScenarioRunRecord): string {
  const labels = labelsOf(run)
  return `${labels.country} : ${run.country.toUpperCase()} · ${labels.sector} : ${sectorLabel(run)} · ${labels.status} : ${
    labels.statuses[run.status]
  } · ${labels.progress} : ${run.released}/${run.total} · ${labels.generated} ${new Date().toISOString()}`
}

function renderMarkdown(run: ScenarioRunRecord, traces: CoTTrace[]): string {
  const labels = labelsOf(run)
  const lines: string[] = [`# ${run.title}`, '', `_${headerOf(run)}_`, '']
  if (run.failure) lines.push(`> ${run.failure}`, '')

  for (const report of run.reports) {
    lines.push(`## ${labels.batch} ${report.tick + 1} · ${report.summary}`, '')

    if (report.agreements.length) {
      lines.push(`### ${labels.agreements}`)
      lines.push(...report.agreements.map((item) => `- ${item}`), '')
    }

    if (report.conflicts.length) {
      lines.push(`### ${labels.conflicts}`)
      for (const conflict of report.conflicts) {
        lines.push(`- **[${conflict.severity}] ${conflict.between.join(' ↔ ')}** · ${conflict.summary}`)
        for (const position of conflict.positions) lines.push(`  - _${position.agentId}_ : ${position.position}`)
      }
      lines.push('')
    }

    if (report.openQuestions.length) {
      lines.push(`### ${labels.openQuestions}`)
      lines.push(...report.openQuestions.map((item) => `- ${item}`), '')
    }

    lines.push(`### ${labels.assessments}`)
    for (const assessment of report.assessments) {
      lines.push(`#### ${assessment.agentId} · ${labels.confidence} ${assessment.confidence}`)
      lines.push(...assessment.findings.map((finding) => `- ${finding}`))
      if (assessment.citations?.length) {
        lines.push('', `_${labels.sources}_`)
        lines.push(
          ...assessment.citations.map((citation) => `- ${citationLabel(citation)} · « ${citation.quote ?? ''} »`),
        )
      }
      if (assessment.webSources?.length) {
        lines.push('', `_${labels.webSources}_`)
        lines.push(...assessment.webSources.map((source) => `- [${source.title}](${source.url})`))
      }
      lines.push('')
    }
  }

  const citations = citationsOf(run)
  if (citations.length) {
    lines.push(`## ${labels.sources}`, '')
    citations.forEach((citation, index) => {
      lines.push(`${index + 1}. **${citationLabel(citation)}** · « ${citation.quote} »`)
    })
    lines.push('')
  }

  const sources = webSourcesOf(run)
  if (sources.length) {
    lines.push(`## ${labels.webSources}`, '')
    lines.push(...sources.map((source) => `- [${source.title}](${source.url})`))
    lines.push('')
  }

  if (traces.length) {
    lines.push(`## ${labels.cot}`, '')
    for (const [agentId, steps] of groupTraces(traces)) {
      lines.push(`### ${agentId}`)
      lines.push(...steps.map((step) => `- ${labels.step} ${step.step} · ${step.thought}`), '')
    }
  }

  return lines.join('\n')
}

function renderHtml(run: ScenarioRunRecord, traces: CoTTrace[]): string {
  const labels = labelsOf(run)
  const esc = escapeHtml

  const reports = run.reports
    .map((report) => {
      const assessments = report.assessments
        .map((assessment) => {
          const findings = assessment.findings.map((finding) => `<li>${esc(finding)}</li>`).join('')
          const citations = (assessment.citations ?? [])
            .map((citation) => `<li>${esc(citationLabel(citation))} · « ${esc(citation.quote ?? '')} »</li>`)
            .join('')
          const sources = (assessment.webSources ?? [])
            .map((source) => `<li><a href="${esc(source.url)}">${esc(source.title)}</a></li>`)
            .join('')
          return `<article class="agent">
  <h4>${esc(assessment.agentId)} <span class="muted">· ${labels.confidence} ${assessment.confidence}</span></h4>
  <ul>${findings}</ul>
  ${citations ? `<p class="muted">${labels.sources}</p><ul>${citations}</ul>` : ''}
  ${sources ? `<p class="muted">${labels.webSources}</p><ul>${sources}</ul>` : ''}
</article>`
        })
        .join('')

      const conflicts = report.conflicts.length
        ? `<h3>${labels.conflicts}</h3><ul>${report.conflicts
            .map(
              (conflict) =>
                `<li><strong class="sev-${conflict.severity}">[${conflict.severity}] ${esc(
                  conflict.between.join(' ↔ '),
                )}</strong> · ${esc(conflict.summary)}</li>`,
            )
            .join('')}</ul>`
        : ''
      const agreements = report.agreements.length
        ? `<h3>${labels.agreements}</h3><ul>${report.agreements.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
        : ''
      const questions = report.openQuestions.length
        ? `<h3>${labels.openQuestions}</h3><ul>${report.openQuestions
            .map((item) => `<li>${esc(item)}</li>`)
            .join('')}</ul>`
        : ''

      return `<section class="batch">
  <h2>${labels.batch} ${report.tick + 1} · ${esc(report.summary)}</h2>
  ${agreements}${conflicts}${questions}
  <h3>${labels.assessments}</h3>
  ${assessments}
</section>`
    })
    .join('')

  const citations = citationsOf(run)
  const sources = webSourcesOf(run)
  const cot = traces.length
    ? `<h2>${labels.cot}</h2>${groupTraces(traces)
        .map(
          ([agentId, steps]) =>
            `<section class="cot"><h3>${esc(agentId)}</h3><ol>${steps
              .map((step) => `<li><span class="muted">${labels.step} ${step.step}</span> ${esc(step.thought)}</li>`)
              .join('')}</ol></section>`,
        )
        .join('')}`
    : ''

  return `<!doctype html>
<html lang="${run.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(run.title)}</title>
<style>
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px; background: #f8fafc; color: #0f172a; font: 15px/1.6 ui-sans-serif, system-ui, sans-serif; }
main { max-width: 880px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; }
h1 { font-size: 24px; margin: 0 0 4px; }
h2 { font-size: 18px; margin: 24px 0 8px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #475569; margin: 14px 0 6px; }
h4 { font-size: 13px; margin: 12px 0 4px; }
p.meta, .muted { color: #64748b; font-size: 12px; }
.meta { margin: 0 0 16px; }
.agent { border-left: 2px solid #0f766e; padding-left: 12px; margin: 10px 0; }
ul { margin: 0 0 8px; padding-left: 18px; }
li { margin: 2px 0; }
a { color: #0f766e; }
.sev-high { color: #ea580c; }
.sev-critical { color: #dc2626; }
</style>
</head>
<body><main>
<h1>${esc(run.title)}</h1>
<p class="muted">${esc(headerOf(run))}</p>
${run.failure ? `<p class="sev-critical">${esc(run.failure)}</p>` : ''}
${reports}
${citations.length ? `<h2>${labels.sources}</h2><ul>${citations.map((citation) => `<li>${esc(citationLabel(citation))} · « ${esc(citation.quote)} »</li>`).join('')}</ul>` : ''}
${sources.length ? `<h2>${labels.webSources}</h2><ul>${sources.map((source) => `<li><a href="${esc(source.url)}">${esc(source.title)}</a></li>`).join('')}</ul>` : ''}
${cot}
</main></body></html>`
}

function docxBlocks(run: ScenarioRunRecord, traces: CoTTrace[]): Array<Record<string, unknown>> {
  const labels = labelsOf(run)
  const blocks: Array<Record<string, unknown>> = [
    { type: 'heading', text: run.title, level: 1 },
    { type: 'callout', text: headerOf(run), tone: 'info' },
  ]
  if (run.failure) blocks.push({ type: 'callout', text: run.failure, tone: 'warning' })

  for (const report of run.reports) {
    blocks.push(
      { type: 'heading', text: `${labels.batch} ${report.tick + 1}`, level: 1 },
      { type: 'paragraph', text: report.summary, size: 11 },
    )
    if (report.agreements.length) {
      blocks.push({ type: 'heading', text: labels.agreements, level: 2 }, { type: 'bullets', items: report.agreements })
    }
    if (report.conflicts.length) {
      blocks.push(
        { type: 'heading', text: labels.conflicts, level: 2 },
        {
          type: 'bullets',
          items: report.conflicts.map(
            (conflict) =>
              `[${conflict.severity}] ${conflict.between.join(' ↔ ')} · ${conflict.summary} · ${conflict.positions
                .map((position) => `${position.agentId} : ${position.position}`)
                .join(' / ')}`,
          ),
        },
      )
    }
    if (report.openQuestions.length) {
      blocks.push({ type: 'heading', text: labels.openQuestions, level: 2 }, { type: 'bullets', items: report.openQuestions })
    }
    blocks.push({ type: 'heading', text: labels.assessments, level: 2 })
    for (const assessment of report.assessments) {
      blocks.push({
        type: 'heading',
        text: `${assessment.agentId} · ${labels.confidence} ${assessment.confidence}`,
        level: 3,
      })
      if (assessment.findings.length) blocks.push({ type: 'bullets', items: assessment.findings })
      const sources = [
        ...(assessment.citations ?? []).map((citation) => `${labels.sources} · ${citationLabel(citation)} · « ${citation.quote ?? ''} »`),
        ...(assessment.webSources ?? []).map((source) => `${labels.webSources} · ${source.title} · ${source.url}`),
      ]
      if (sources.length) blocks.push({ type: 'bullets', items: sources })
    }
  }

  const citations = citationsOf(run)
  if (citations.length) {
    blocks.push(
      { type: 'heading', text: labels.sources, level: 1 },
      { type: 'numbered', items: citations.map((citation) => `${citationLabel(citation)} · « ${citation.quote} »`) },
    )
  }
  const sources = webSourcesOf(run)
  if (sources.length) {
    blocks.push(
      { type: 'heading', text: labels.webSources, level: 1 },
      { type: 'bullets', items: sources.map((source) => `${source.title} · ${source.url}`) },
    )
  }
  if (traces.length) {
    blocks.push({ type: 'heading', text: labels.cot, level: 1 })
    for (const [agentId, steps] of groupTraces(traces)) {
      blocks.push(
        { type: 'heading', text: agentId, level: 2 },
        { type: 'bullets', items: steps.map((step) => `${labels.step} ${step.step} · ${step.thought}`.slice(0, 1000)) },
      )
    }
  }

  return blocks
}

export async function buildScenarioExport(input: {
  run: ScenarioRunRecord
  traces: CoTTrace[]
  format: ScenarioExportFormat
  mcp?: McpGateway
}): Promise<ScenarioExportFile> {
  const { run, traces, format } = input
  const base = `scenario-${run.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`

  if (format === 'json') {
    return {
      filename: `${base}.json`,
      mime: 'application/json; charset=utf-8',
      content: JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          run: {
            id: run.id,
            title: run.title,
            country: run.country,
            domain: run.domain,
            lang: run.lang,
            status: run.status,
            failure: run.failure,
            released: run.released,
            total: run.total,
            createdAt: run.createdAt,
            updatedAt: run.updatedAt,
          },
          reports: run.reports,
          citations: citationsOf(run),
          webSources: webSourcesOf(run),
          traces,
        },
        null,
        2,
      ),
      encoding: 'utf8',
    }
  }

  if (format === 'markdown') {
    return {
      filename: `${base}.md`,
      mime: 'text/markdown; charset=utf-8',
      content: renderMarkdown(run, traces),
      encoding: 'utf8',
    }
  }

  if (format === 'html') {
    return {
      filename: `${base}.html`,
      mime: 'text/html; charset=utf-8',
      content: renderHtml(run, traces),
      encoding: 'utf8',
    }
  }

  const call = await callMcpTool(input.mcp, 'sea_mcp_docx', /^docx_create_document$/i, {
    title: run.title,
    subtitle: `${run.country.toUpperCase()} · ${sectorLabel(run)}`,
    headerText: 'SarkiAI Policy Sandbox',
    footerText: 'SarkiAI Policy Sandbox',
    pageNumbers: true,
    accentColor: '0F766E',
    filename: base,
    blocks: docxBlocks(run, traces),
  })
  if (!call.ok) throw new Error(`Word generation failed: ${call.message}`)
  const content =
    (call.result as { content?: Array<{ type?: string; resource?: { blob?: string } }> })?.content ?? []
  const blob = content.find((item) => item.type === 'resource')?.resource?.blob
  if (!blob) throw new Error('Word generation returned no file.')
  return {
    filename: `${base}.docx`,
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    content: blob,
    encoding: 'base64',
  }
}
