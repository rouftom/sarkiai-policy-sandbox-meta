/**
 * Export of the after-action report.
 *
 * One section model feeds every format, so the Markdown file, the HTML page and
 * the PDF (printed from the HTML) always carry the same content. Facts come from
 * the report's computed fields; prose and figures come from the model and from
 * Meta Image. Nothing here calls the network.
 */

import type { AfterActionDto, ReportImageDto } from '@/lib/api'
import type { MessageKey } from '@/lib/i18n'

export type ReportLabel = (key: MessageKey) => string
export type ReportFormat = 'markdown' | 'html'

export interface ReportTable {
  head: string[]
  rows: string[][]
}

export interface ReportSection {
  heading: string
  paragraphs: string[]
  bullets: string[]
  table?: ReportTable
  /** Bold lead-in for bullets, e.g. the institution of a team entry. */
  bulletLead?: string[]
  image?: ReportImageDto
}

export interface ReportModel {
  title: string
  subtitle: string
  cover?: ReportImageDto
  sections: ReportSection[]
  footer: string
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function text(value: string | undefined): string {
  return value ?? ''
}

function normalizeReport(report: AfterActionDto): AfterActionDto {
  const narrative = report.narrative as Partial<AfterActionDto['narrative']> & { summary?: string }
  return {
    ...report,
    addressed: report.addressed ?? [],
    missed: report.missed ?? [],
    situations: report.situations ?? [],
    teamInputs: report.teamInputs ?? [],
    references: report.references ?? [],
    images: report.images ?? [],
    lang: report.lang ?? 'en',
    generatedAt: report.generatedAt ?? new Date(0).toISOString(),
    narrative: {
      title: text(narrative.title) || report.title,
      intro: text(narrative.intro) || text(narrative.summary),
      context: text(narrative.context),
      analysis: text(narrative.analysis),
      teamInputs: text(narrative.teamInputs),
      strengths: narrative.strengths ?? [],
      improvements: narrative.improvements ?? [],
      recommendations: narrative.recommendations ?? [],
      conclusion: text(narrative.conclusion),
      unresolved: narrative.unresolved ?? [],
    },
  }
}

export function imageSource(image: ReportImageDto): string {
  return `data:${image.mime};base64,${image.dataBase64}`
}

/**
 * Tolerates a report written by an older API (no situations, team inputs,
 * references or figures; a `summary` instead of the sections).
 */
export function buildReportModel(input: AfterActionDto, label: ReportLabel): ReportModel {
  const report = normalizeReport(input)
  const { narrative } = report
  const images = report.images
  const coverage = Math.round(report.coverage * 100)
  const outcome = (value: 'addressed' | 'late' | 'missed') => label(`exercise.outcome.${value}`)

  const metrics: ReportTable = {
    head: [label('exercise.report.metric'), label('exercise.report.value')],
    rows: [
      [label('exercise.coverage'), `${coverage}%`],
      [label('exercise.released'), String(report.releasedInjects)],
      [label('exercise.addressed'), String(report.addressed?.length ?? 0)],
      [label('exercise.missed'), String(report.missed?.length ?? 0)],
      [label('exercise.average'), report.averageResponseMinutes === null ? 'n/a' : `${report.averageResponseMinutes} min`],
      [label('exercise.firstAction'), report.firstActionMinute === null ? 'n/a' : `T+${report.firstActionMinute}`],
    ],
  }

  const situations: ReportTable = {
    head: [
      label('exercise.report.minute'),
      label('exercise.report.incident'),
      label('exercise.report.outcome'),
      label('exercise.report.latency'),
      label('exercise.expected'),
    ],
    rows: report.situations.map((item) => [
      `T+${item.releasedAtMinute}`,
      item.title,
      outcome(item.outcome),
      item.latencyMinutes === null ? 'n/a' : `${item.latencyMinutes} min`,
      item.expectedAction,
    ]),
  }

  const teamEntries = report.teamInputs.flatMap((group) =>
    group.entries.map((entry) => ({
      lead: `${group.actor} · T+${entry.atMinute} [${entry.kind}]${entry.injectId ? ` → ${entry.injectId}` : ''}`,
      text: entry.text,
    })),
  )

  const sources = report.references.map((reference) =>
    reference.authority ? `${reference.title} · ${reference.authority}` : reference.title,
  )

  const sections: ReportSection[] = [
    { heading: label('exercise.report.intro'), paragraphs: [narrative.intro], bullets: [] },
    { heading: label('exercise.report.context'), paragraphs: [narrative.context], bullets: [] },
    { heading: label('exercise.report.metrics'), paragraphs: [], bullets: [], table: metrics },
    {
      heading: label('exercise.report.situations'),
      paragraphs: [],
      bullets: [],
      table: situations,
      image: images.find((image) => image.id === 'timeline'),
    },
    {
      heading: label('exercise.report.teamInputs'),
      paragraphs: [narrative.teamInputs],
      bullets: teamEntries.map((entry) => entry.text),
      bulletLead: teamEntries.map((entry) => entry.lead),
    },
    { heading: label('exercise.report.analysis'), paragraphs: [narrative.analysis], bullets: [] },
    { heading: label('exercise.report.strengths'), paragraphs: [], bullets: narrative.strengths },
    { heading: label('exercise.report.improvements'), paragraphs: [], bullets: narrative.improvements },
    { heading: label('exercise.report.recommendations'), paragraphs: [], bullets: narrative.recommendations },
    { heading: label('exercise.report.unresolved'), paragraphs: [], bullets: narrative.unresolved },
    { heading: label('exercise.report.conclusion'), paragraphs: [narrative.conclusion], bullets: [] },
    { heading: label('exercise.report.sources'), paragraphs: [], bullets: sources },
  ]

  const generated = new Date(report.generatedAt).toLocaleString(report.lang === 'fr' ? 'fr-FR' : 'en-GB')

  return {
    title: narrative.title || report.title,
    subtitle: `${report.title} · ${report.durationMinutes} min · T+${report.evaluatedAtMinute}`,
    cover: images.find((image) => image.id === 'context'),
    sections: sections.filter(
      (section) =>
        section.paragraphs.some((paragraph) => paragraph.trim() !== '') ||
        section.bullets.length > 0 ||
        section.table !== undefined ||
        section.image !== undefined,
    ),
    footer: `${label('exercise.report.generated')} ${generated} · ${report.model}`,
  }
}

function imageMarkdown(image: ReportImageDto): string {
  return `![${image.caption.replace(/[[\]]/g, '')}](${imageSource(image)})`
}

export function toMarkdown(report: AfterActionDto, label: ReportLabel): string {
  const model = buildReportModel(report, label)
  const lines: string[] = [`# ${model.title}`, '', `_${model.subtitle}_`, '']
  if (model.cover) lines.push(imageMarkdown(model.cover), '')

  for (const section of model.sections) {
    lines.push(`## ${section.heading}`, '')
    for (const paragraph of section.paragraphs) {
      if (paragraph.trim()) lines.push(paragraph.trim(), '')
    }
    if (section.table) {
      const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
      lines.push(`| ${section.table.head.map(cell).join(' | ')} |`)
      lines.push(`| ${section.table.head.map(() => '---').join(' | ')} |`)
      for (const row of section.table.rows) lines.push(`| ${row.map(cell).join(' | ')} |`)
      lines.push('')
    }
    if (section.image) lines.push(imageMarkdown(section.image), '')
    section.bullets.forEach((bullet, index) => {
      const lead = section.bulletLead?.[index]
      lines.push(lead ? `- **${lead}**: ${bullet}` : `- ${bullet}`)
    })
    if (section.bullets.length > 0) lines.push('')
  }

  lines.push('---', '', `_${model.footer}_`, '')
  return lines.join('\n')
}

const REPORT_CSS = `
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; background: #ffffff; }
main { max-width: 820px; margin: 0 auto; padding: 40px 28px; }
header { border-bottom: 3px solid #0f766e; padding-bottom: 14px; margin-bottom: 24px; }
h1 { font-size: 26px; margin: 0 0 6px; color: #0f766e; }
.subtitle { color: #475569; font-size: 13px; margin: 0; }
h2 { font-size: 17px; margin: 28px 0 10px; padding-left: 10px; border-left: 4px solid #0f766e; break-after: avoid; }
p { margin: 0 0 10px; }
ul { margin: 0 0 12px; padding-left: 20px; }
li { margin-bottom: 4px; }
li strong { color: #0f766e; }
figure { margin: 16px 0; break-inside: avoid; }
figure img { width: 100%; border-radius: 12px; border: 1px solid #e2e8f0; }
figcaption { font-size: 12px; color: #64748b; margin-top: 6px; }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin: 8px 0 14px; break-inside: avoid; }
th { text-align: left; background: #f1f5f9; color: #334155; font-weight: 600; }
th, td { border: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; }
tr:nth-child(even) td { background: #f8fafc; }
.cover { margin: 0 0 22px; }
footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
@media print { main { padding: 0; } h2 { break-after: avoid; } }
`

export function toHtml(report: AfterActionDto, label: ReportLabel): string {
  const model = buildReportModel(report, label)
  const figure = (image: ReportImageDto, className?: string) =>
    `<figure${className ? ` class="${className}"` : ''}><img src="${imageSource(image)}" alt="${escapeHtml(image.caption)}" /><figcaption>${escapeHtml(image.caption)}</figcaption></figure>`

  const body: string[] = []
  if (model.cover) body.push(figure(model.cover, 'cover'))
  for (const section of model.sections) {
    body.push(`<section><h2>${escapeHtml(section.heading)}</h2>`)
    for (const paragraph of section.paragraphs) {
      if (paragraph.trim()) body.push(`<p>${escapeHtml(paragraph.trim())}</p>`)
    }
    if (section.table) {
      body.push('<table><thead><tr>')
      body.push(...section.table.head.map((head) => `<th>${escapeHtml(head)}</th>`))
      body.push('</tr></thead><tbody>')
      for (const row of section.table.rows) {
        body.push(`<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
      }
      body.push('</tbody></table>')
    }
    if (section.image) body.push(figure(section.image))
    if (section.bullets.length > 0) {
      body.push('<ul>')
      section.bullets.forEach((bullet, index) => {
        const lead = section.bulletLead?.[index]
        body.push(
          lead
            ? `<li><strong>${escapeHtml(lead)}</strong>: ${escapeHtml(bullet)}</li>`
            : `<li>${escapeHtml(bullet)}</li>`,
        )
      })
      body.push('</ul>')
    }
    body.push('</section>')
  }

  return `<!doctype html>
<html lang="${report.lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(model.title)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<main>
<header>
<h1>${escapeHtml(model.title)}</h1>
<p class="subtitle">${escapeHtml(model.subtitle)}</p>
</header>
${body.join('\n')}
<footer>${escapeHtml(model.footer)}</footer>
</main>
</body>
</html>`
}

export function reportFilename(report: AfterActionDto, extension: 'md' | 'html' | 'pdf'): string {
  const slug = (report.narrative?.title || report.title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'rapport-post-exercice'}.${extension}`
}

/** Saves a text file through a temporary object URL. Browser-only. */
export function downloadText(content: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * PDF: the report page is printed in a hidden frame, so the browser's own
 * "Save as PDF" destination produces the file. No server-side PDF library.
 */
export function printReport(html: string): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 60_000)
  }
  frame.srcdoc = html
  document.body.appendChild(frame)
}
