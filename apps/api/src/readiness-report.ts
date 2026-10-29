/**
 * Report of one AI-readiness assessment, in French or English, as Markdown, a
 * self-contained HTML page (print it to PDF from the browser), or a Word file.
 *
 * One structure feeds the three formats: a cover, a table of contents, parts,
 * sections, and blocks (text, notes and tips, tables, charts, process flow,
 * sources). Each format renders the blocks its own way: Markdown and Word carry
 * no inline image, so the charts become text bars or a shaded grid, and the
 * cover is linked (Markdown) or embedded (HTML) only when it exists.
 *
 * Figures and their status:
 *  - chart:   the scores, rendered as a PNG; validated by the charts server
 *             (`sarkiai_charts_display_chart`) when it answers;
 *  - diagram: the process, rendered as a PNG from the steps;
 *  - cover:   Meta Image (`muse-image-1.0`), or a labelled sample when unavailable;
 *             uploaded to Cloudinary when configured;
 *  - Word:    `docx_create_document` (docx server) returns the .docx file itself.
 * Tool names come from the servers' tool lists (see @fada/ai `mcp/`).
 */

import { Resvg } from '@resvg/resvg-js'
import type { McpGateway } from './mcp.js'
import { callMcpTool } from './mcp-tool.js'
import { referenceImage, type GeneratedImage, type ImageGenerationOptions } from '@sps/agents'
import { dimensionTextIn, flagOf, type ReadinessLang } from '@sps/shared'
import type { ReadinessRun } from './readiness-runs.js'
import { optimizedUrl, uploadImage, type UploadedImage } from './cloudinary.js'

export type ReportFormat = 'markdown' | 'html' | 'docx'

export interface ReportAsset {
  kind: 'chart' | 'diagram' | 'cover' | 'document'
  status: 'included' | 'unavailable' | 'fallback'
  tool?: string
  message: string
}

export interface GeneratedReport {
  filename: string
  mime: string
  /** Text for Markdown and HTML, base64 bytes for Word. */
  content: string
  encoding: 'utf8' | 'base64'
  assets: ReportAsset[]
}

interface Note {
  tone: 'info' | 'tip' | 'warning'
  title: string
  text?: string
  items?: string[]
}

/** A figure rendered as a PNG on the server, and its public address once uploaded. */
interface FigureImage {
  png: Buffer
  url?: string
}

type Block =
  | { kind: 'paragraph'; text: string; strong?: boolean }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'numbered'; items: string[] }
  | { kind: 'note'; note: Note }
  | { kind: 'table'; columns: string[]; rows: string[][]; widths?: number[] }
  | { kind: 'chart'; rows: Array<{ label: string; value: number }>; image?: FigureImage }
  | { kind: 'flow'; steps: string[]; image?: FigureImage }
  | { kind: 'sources'; items: Array<{ title: string; url: string }> }

interface Section {
  title: string
  blocks: Block[]
}

interface Part {
  title: string
  sections: Section[]
}

interface Doc {
  lang: ReadinessLang
  title: string
  countryCode: string
  countryName: string
  flag: string
  domain: string
  date: string
  runBy: string
  composite: string
  average: string
  coverUrl?: string
  coverDataUri?: string
  /** The cover for Word: a PNG or JPEG in base64, at most 1200 px wide. */
  coverDocx?: string
  parts: Part[]
  assets: ReportAsset[]
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ACCENT = '0F766E'

const LABELS = {
  fr: {
    cover: 'Rapport de maturité IA',
    toc: 'Sommaire',
    part: 'Partie',
    date: 'Date',
    runBy: 'Évaluée par',
    composite: 'Score composite',
    average: 'Moyenne',
    summary: 'Synthèse',
    situation: 'Situation actuelle',
    keyResults: 'Résultats clés',
    weakest: 'Dimensions les plus faibles',
    reading: 'Lecture : 0 = non démarré, 3 = établi, 5 = leader.',
    scores: 'Scores',
    chart: 'Graphique des scores',
    table: 'Tableau des scores',
    dimension: 'Dimension',
    score: 'Score',
    maturity: 'Maturité',
    confidence: 'Confiance',
    analysis: 'Analyse par dimension',
    evidence: 'Éléments probants',
    gaps: 'Lacunes',
    recommendations: 'Recommandations',
    process: 'Processus d’évaluation',
    diagram: 'Diagramme',
    method: 'Méthode',
    dimensionsAssessed: 'Dimensions évaluées',
    webSources: 'Sources web consultées',
    sources: 'Sources',
    noSources: 'Aucune source web consultée.',
    noGaps: 'Aucune lacune relevée.',
    annex: 'Annexes',
    figures: 'Figures et statut',
    figure: 'Figure',
    status: 'Statut',
    tool: 'Outil',
    detail: 'Détail',
    methodology: 'Méthodologie',
    methodText:
      'Chaque dimension est notée de 0 à 5 à partir des passages du corpus national et des meilleures pratiques mondiales, complétés par une recherche web en direct lorsqu’elle est active. Le score composite est la moyenne pondérée des dimensions.',
    noteInfo: 'Note',
    noteTip: 'Astuce',
    noteWarning: 'Attention',
    start: 'Départ',
    web: 'Recherche web',
    synthesis: 'Synthèse',
    saved: 'Enregistrée',
    chartRendered: 'image PNG rendue sur le serveur à partir des scores',
    diagramRendered: 'image PNG rendue sur le serveur à partir des étapes',
    renderFailed: 'rendu image impossible, figure en texte',
    validated: 'validé par le serveur MCP',
    unvalidated: 'serveur MCP indisponible',
    coverMeta: 'généré avec Meta Image',
    coverSample: 'échantillon (Meta Image non configuré ou indisponible)',
    wordIncluded: 'fichier Word renvoyé par le serveur docx',
    wordWithoutImages: 'fichier Word renvoyé ; serveur sans bloc image, figures en texte',
    noCover: 'Couverture absente du format',
    summaryFallback: 'Synthèse non disponible pour cette évaluation.',
  },
  en: {
    cover: 'AI readiness report',
    toc: 'Contents',
    part: 'Part',
    date: 'Date',
    runBy: 'Assessed by',
    composite: 'Composite score',
    average: 'Average',
    summary: 'Summary',
    situation: 'Current situation',
    keyResults: 'Key results',
    weakest: 'Weakest dimensions',
    reading: 'Reading: 0 = not started, 3 = established, 5 = leading.',
    scores: 'Scores',
    chart: 'Score chart',
    table: 'Score table',
    dimension: 'Dimension',
    score: 'Score',
    maturity: 'Maturity',
    confidence: 'Confidence',
    analysis: 'Analysis by dimension',
    evidence: 'Supporting evidence',
    gaps: 'Gaps',
    recommendations: 'Recommendations',
    process: 'Assessment process',
    diagram: 'Diagram',
    method: 'Method',
    dimensionsAssessed: 'Dimensions assessed',
    webSources: 'Web sources consulted',
    sources: 'Sources',
    noSources: 'No web source consulted.',
    noGaps: 'No gap found.',
    annex: 'Annexes',
    figures: 'Figures and status',
    figure: 'Figure',
    status: 'Status',
    tool: 'Tool',
    detail: 'Detail',
    methodology: 'Methodology',
    methodText:
      'Each dimension is scored from 0 to 5 from the national corpus passages and global best practice, completed by live web research when it is on. The composite score is the weighted average of the dimensions.',
    noteInfo: 'Note',
    noteTip: 'Tip',
    noteWarning: 'Warning',
    start: 'Start',
    web: 'Web search',
    synthesis: 'Synthesis',
    saved: 'Saved',
    chartRendered: 'PNG image rendered on the server from the scores',
    diagramRendered: 'PNG image rendered on the server from the steps',
    renderFailed: 'image rendering failed, figure kept as text',
    validated: 'validated by the MCP server',
    unvalidated: 'MCP server unavailable',
    coverMeta: 'generated with Meta Image',
    coverSample: 'sample (Meta Image not configured or unavailable)',
    wordIncluded: 'Word file returned by the docx server',
    wordWithoutImages: 'Word file returned; server without image block, figures kept as text',
    noCover: 'Cover not part of this format',
    summaryFallback: 'No summary available for this assessment.',
  },
} as const

type Labels = (typeof LABELS)[ReadinessLang]

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function countryNameOf(code: string, lang: ReadinessLang): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code.toUpperCase()) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

/** A PNG of an SVG drawing, `width` pixels wide; null when the drawing cannot be rendered. */
function rasterize(svg: string, width: number): Buffer | null {
  try {
    return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'white', font: { loadSystemFonts: true } }).render().asPng())
  } catch (error) {
    console.error('Figure rendering failed:', (error as Error).message)
    return null
  }
}

function barChartSvg(rows: Array<{ label: string; value: number }>): string {
  const width = 760
  const rowHeight = 30
  const left = 300
  const track = width - left - 60
  const height = rows.length * rowHeight + 40
  const bars = rows
    .map((row, index) => {
      const y = 28 + index * rowHeight
      const w = (Math.max(0, Math.min(5, row.value)) / 5) * track
      return `<text x="${left - 10}" y="${y + 13}" text-anchor="end" font-size="12" fill="#0f172a">${esc(row.label)}</text><rect x="${left}" y="${y}" width="${track}" height="16" rx="8" fill="#e2e8f0"/><rect x="${left}" y="${y}" width="${w.toFixed(1)}" height="16" rx="8" fill="#${ACCENT}"/><text x="${width - 50}" y="${y + 13}" font-size="12" font-family="monospace" fill="#0f172a">${row.value}/5</text>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Scores">${bars}</svg>`
}

function flowSvg(steps: string[]): string {
  const boxW = 150
  const gap = 36
  const width = steps.length * (boxW + gap) + 20
  const height = 120
  const boxes = steps
    .map((label, index) => {
      const x = 10 + index * (boxW + gap)
      const arrow =
        index < steps.length - 1
          ? `<line x1="${x + boxW}" y1="60" x2="${x + boxW + gap - 6}" y2="60" stroke="#64748b" stroke-width="2" marker-end="url(#arrow)"/>`
          : ''
      return `<rect x="${x}" y="30" width="${boxW}" height="60" rx="12" fill="#ccfbf1" stroke="#${ACCENT}" stroke-width="2"/><text x="${x + boxW / 2}" y="66" text-anchor="middle" font-size="12" fill="#0f172a">${esc(label.slice(0, 26))}</text>${arrow}`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Process"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#64748b"/></marker></defs>${boxes}</svg>`
}

function buildParts(
  run: ReadinessRun,
  lang: ReadinessLang,
  labels: Labels,
  composite: number | null,
  webSources: Array<{ title: string; url: string }>,
  steps: string[],
  assets: ReportAsset[],
  figures: { chart?: FigureImage; diagram?: FigureImage },
): Part[] {
  const { report } = run
  const texts = report.scores.map((score) => ({ score, text: dimensionTextIn(score, lang) }))
  const situation = report.situation?.[lang] ?? report.situation?.en ?? report.situation?.fr
  const weakest = [...report.scores].sort((a, b) => a.score - b.score).slice(0, 3)
  const average = report.scenario?.overall ?? null
  const summary: Section[] = [
    {
      title: labels.situation,
      blocks: situation
        ? [
            { kind: 'paragraph', text: situation.headline, strong: true },
            { kind: 'paragraph', text: situation.situation },
            { kind: 'paragraph', text: situation.context },
          ]
        : [{ kind: 'paragraph', text: report.summary || labels.summaryFallback }],
    },
    {
      title: labels.keyResults,
      blocks: [
        { kind: 'paragraph', text: `${labels.composite} : ${composite ?? 'n/a'}/5 · ${labels.average} : ${average ?? 'n/a'}/5` },
        { kind: 'paragraph', text: labels.weakest, strong: true },
        { kind: 'bullets', items: weakest.map((score) => `D${score.dimensionId} · ${score.dimensionName} : ${score.score}/5 (${score.maturity})`) },
        { kind: 'note', note: { tone: 'info', title: labels.reading } },
      ],
    },
  ]

  const scores: Section[] = [
    { title: labels.chart, blocks: [{ kind: 'chart', rows: report.scores.map((score) => ({ label: `D${score.dimensionId} ${score.dimensionName}`, value: score.score })), image: figures.chart }] },
    {
      title: labels.table,
      blocks: [
        {
          kind: 'table',
          columns: [labels.dimension, labels.score, labels.maturity, labels.confidence],
          rows: report.scores.map((score) => [`D${score.dimensionId} · ${score.dimensionName}`, `${score.score}/5`, score.maturity, `${Math.round(score.confidence * 100)} %`]),
          widths: [4, 1.5, 2.5, 1.5],
        },
      ],
    },
  ]

  const analysis: Section[] = texts.map(({ score, text }) => {
    const blocks: Block[] = [
      { kind: 'paragraph', text: `${score.score}/5 · ${score.maturity} · ${labels.confidence} ${Math.round(score.confidence * 100)} %`, strong: true },
    ]
    if (text.summary) blocks.push({ kind: 'paragraph', text: text.summary })
    if (text.evidence.length) blocks.push({ kind: 'paragraph', text: labels.evidence, strong: true }, { kind: 'bullets', items: text.evidence })
    blocks.push(
      text.gaps.length
        ? { kind: 'note', note: { tone: 'warning', title: labels.gaps, items: text.gaps } }
        : { kind: 'paragraph', text: labels.noGaps },
    )
    if (text.recommendations.length) blocks.push({ kind: 'note', note: { tone: 'tip', title: labels.recommendations, items: text.recommendations } })
    return { title: `D${score.dimensionId} · ${score.dimensionName}`, blocks }
  })

  const process: Section[] = [
    { title: labels.diagram, blocks: [{ kind: 'flow', steps, image: figures.diagram }] },
    {
      title: labels.method,
      blocks: [
        { kind: 'bullets', items: [`${labels.dimensionsAssessed} : ${report.scores.length}`, `${labels.webSources} : ${webSources.length}`] },
        { kind: 'paragraph', text: labels.methodText },
      ],
    },
  ]

  const sources: Section[] = [
    {
      title: labels.webSources,
      blocks: webSources.length ? [{ kind: 'sources', items: webSources }] : [{ kind: 'paragraph', text: labels.noSources }],
    },
  ]

  const annex: Section[] = [
    {
      title: labels.figures,
      blocks: [
        {
          kind: 'table',
          columns: [labels.figure, labels.status, labels.tool, labels.detail],
          rows: assets.map((asset) => [asset.kind, asset.status, asset.tool ?? 'n/a', asset.message]),
          widths: [1.5, 1.2, 2, 4],
        },
      ],
    },
  ]

  return [
    { title: `${labels.summary}`, sections: summary },
    { title: labels.scores, sections: scores },
    { title: labels.analysis, sections: analysis },
    { title: labels.process, sections: process },
    { title: labels.sources, sections: sources },
    { title: labels.annex, sections: annex },
  ]
}

async function coverFigure(run: ReadinessRun, options: ImageGenerationOptions | null, labels: Labels): Promise<{ asset: ReportAsset; image: GeneratedImage }> {
  const image = await referenceImage(
    `A clean editorial cover illustration for a national AI readiness report on ${run.domain.replace(/_/g, ' ')} in ${run.country.toUpperCase()}. Abstract, calm, flat vector style, no text.`,
    { title: `${labels.cover} · ${run.country.toUpperCase()}`, lines: ['13 dimensions', 'Scores 0 to 5'] },
    options,
  )
  return {
    asset: {
      kind: 'cover',
      status: image.source === 'meta-image' ? 'included' : 'fallback',
      tool: image.model,
      message: image.source === 'meta-image' ? labels.coverMeta : labels.coverSample,
    },
    image,
  }
}

export async function buildReadinessReport(
  run: ReadinessRun,
  options: { format: ReportFormat; lang?: ReadinessLang; mcp?: McpGateway; image: ImageGenerationOptions | null; generatedAt?: string },
): Promise<GeneratedReport> {
  const lang: ReadinessLang = options.lang ?? 'fr'
  const labels = LABELS[lang]
  const { report } = run
  const composite = report.scenario?.composite ?? null
  const date = (options.generatedAt ?? new Date().toISOString()).slice(0, 16).replace('T', ' ')
  const base = `maturite-ia-${run.country}-${run.createdAt.slice(0, 10)}`
  const rows = report.scores.map((score) => ({ label: score.dimensionName, value: score.score }))
  const steps = [labels.start, labels.web, ...report.scores.map((score) => score.dimensionName), labels.synthesis, labels.saved]
  const webSources = [...new Map(report.scores.flatMap((score) => score.webSources ?? []).map((source) => [source.url, source])).values()]

  // The figures are drawn from the assessment; the MCP servers check their data.
  const chartPng = rasterize(barChartSvg(rows), 1200)
  const diagramPng = rasterize(flowSvg(steps), 1200)
  const [chartCall, cover] = await Promise.all([
    callMcpTool(options.mcp, 'sarkiai_charts', /display_chart/i, {
      type: 'horizontal_bar',
      data: rows.map((row) => ({ dimension: row.label, score: row.value })),
      config: { series: [{ key: 'score' }], locale: lang === 'fr' ? 'fr-FR' : 'en-GB' },
    }),
    coverFigure(run, options.image, labels),
  ])

  // Public addresses: the figures for Markdown, the cover for every format.
  const coverSource = cover.image.dataBase64
    ? { data: cover.image.dataBase64, mime: cover.image.mime }
    : null
  const coverUpload = coverSource ? await uploadImage(`data:${coverSource.mime};base64,${coverSource.data}`, `readiness/${run.id}/cover`) : null
  const [chartUrl, diagramUrl] =
    options.format === 'markdown'
      ? await Promise.all([
          chartPng ? uploadImage(`data:image/png;base64,${chartPng.toString('base64')}`, `readiness/${run.id}/chart`) : null,
          diagramPng ? uploadImage(`data:image/png;base64,${diagramPng.toString('base64')}`, `readiness/${run.id}/diagram`) : null,
        ])
      : [null, null]

  const assets: ReportAsset[] = [
    {
      kind: 'chart',
      status: chartPng && chartCall.ok ? 'included' : 'fallback',
      tool: chartCall.ok ? chartCall.tool : undefined,
      message: [chartPng ? labels.chartRendered : labels.renderFailed, chartCall.ok ? labels.validated : `${labels.unvalidated} (${chartCall.message})`].join(' · '),
    },
    {
      kind: 'diagram',
      status: diagramPng ? 'included' : 'fallback',
      message: diagramPng ? labels.diagramRendered : labels.renderFailed,
    },
    cover.asset,
  ]

  const figures = {
    chart: chartPng ? { png: chartPng, ...(chartUrl ? { url: chartUrl.url } : {}) } : undefined,
    diagram: diagramPng ? { png: diagramPng, ...(diagramUrl ? { url: diagramUrl.url } : {}) } : undefined,
  }
  const parts = buildParts(run, lang, labels, composite, webSources, steps, assets, figures)

  const countryCode = run.country.toUpperCase()
  const doc: Doc = {
    lang,
    title: `${labels.cover} · ${countryCode}`,
    countryCode,
    countryName: countryNameOf(run.country, lang),
    flag: flagOf(run.country),
    domain: run.domain.replace(/_/g, ' '),
    date,
    runBy: run.runBy,
    composite: composite === null ? 'n/a' : String(composite),
    average: report.scenario?.overall === undefined ? 'n/a' : String(report.scenario.overall),
    parts,
    assets,
  }

  if (options.format === 'docx') {
    doc.coverDocx = await coverForWord(coverSource, coverUpload)
    const word = (withImages: boolean) =>
      callMcpTool(options.mcp, 'sea_mcp_docx', /^docx_create_document$/i, {
        title: `${doc.flag} ${doc.countryName} · ${labels.cover}`.trim(),
        subtitle: `${doc.domain} · ${date}`,
        headerText: 'SarkiAI Policy Sandbox',
        footerText: `${labels.runBy} : ${run.runBy}`,
        pageNumbers: true,
        accentColor: ACCENT,
        filename: base,
        blocks: toDocxBlocks(doc, labels, withImages),
      })
    // A Word server that predates image blocks refuses them: the file is then made without images.
    let withImages = true
    let call = await word(true)
    if (!call.ok) {
      withImages = false
      call = await word(false)
    }
    if (!call.ok) throw new Error(`Word generation failed: ${call.message}`)
    const content = (call.result as { content?: Array<{ type?: string; resource?: { blob?: string } }> }).content ?? []
    const blob = content.find((item) => item.type === 'resource')?.resource?.blob
    if (!blob) throw new Error('Word generation returned no file.')
    doc.assets.push({ kind: 'document', status: withImages ? 'included' : 'fallback', tool: call.tool, message: withImages ? labels.wordIncluded : labels.wordWithoutImages })
    return { filename: `${base}.docx`, mime: DOCX_MIME, content: blob, encoding: 'base64', assets: doc.assets }
  }

  // The cover is linked or embedded only when it exists; no other image is inlined.
  if (coverUpload) doc.coverUrl = coverUpload.url
  if (options.format === 'html' && coverSource) doc.coverDataUri = `data:${coverSource.mime};base64,${coverSource.data}`

  if (options.format === 'markdown') {
    return { filename: `${base}.md`, mime: 'text/markdown; charset=utf-8', content: toMarkdown(doc, labels), encoding: 'utf8', assets: doc.assets }
  }
  return { filename: `${base}.html`, mime: 'text/html; charset=utf-8', content: toHtml(doc, labels), encoding: 'utf8', assets: doc.assets }
}

/**
 * The cover as the Word server takes it (PNG or JPEG, base64). With Cloudinary,
 * a 1200 px JPEG derived from the upload is fetched; otherwise the cover is used
 * as generated, and an SVG sample is rendered. Null when nothing usable exists.
 */
async function coverForWord(
  source: { data: string; mime: string } | null,
  upload: UploadedImage | null,
): Promise<string | undefined> {
  if (upload) {
    try {
      const response = await fetch(optimizedUrl(upload.publicId, 1200), { signal: AbortSignal.timeout(15_000) })
      if (response.ok) return Buffer.from(await response.arrayBuffer()).toString('base64')
    } catch {
      /* the original below */
    }
  }
  if (!source) return undefined
  if (source.mime.includes('svg')) return rasterize(Buffer.from(source.data, 'base64').toString('utf8'), 1200)?.toString('base64')
  return source.data
}

function mdTable(columns: string[], rows: string[][]): string[] {
  const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return [`| ${columns.map(cell).join(' | ')} |`, `| ${columns.map(() => '-').join(' | ')} |`, ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)]
}

function mdNote(note: Note, labels: Labels): string[] {
  const label = note.tone === 'tip' ? labels.noteTip : note.tone === 'warning' ? labels.noteWarning : labels.noteInfo
  const lines = [`> **${label} · ${note.title}**`]
  if (note.text) lines.push('>', `> ${note.text}`)
  for (const item of note.items ?? []) lines.push(`> - ${item}`)
  return [...lines, '']
}

function toMarkdown(doc: Doc, labels: Labels): string {
  const lines: string[] = [
    `# ${doc.flag} ${doc.countryName} · ${labels.cover}`,
    '',
    `${doc.domain} · ${labels.date} : ${doc.date} · ${labels.runBy} : ${doc.runBy}`,
    '',
    `${labels.composite} : **${doc.composite}/5** · ${labels.average} : **${doc.average}/5**`,
    '',
  ]
  if (doc.coverUrl) lines.push(`![${labels.cover}](${doc.coverUrl})`, '')
  lines.push(`## ${labels.toc}`, '')
  doc.parts.forEach((part, index) => lines.push(`${index + 1}. ${part.title}`))
  lines.push('')

  doc.parts.forEach((part, partIndex) => {
    lines.push(`# ${labels.part} ${partIndex + 1} · ${part.title}`, '')
    part.sections.forEach((section, sectionIndex) => {
      lines.push(`## ${partIndex + 1}.${sectionIndex + 1} ${section.title}`, '')
      for (const block of section.blocks) {
        if (block.kind === 'paragraph') {
          lines.push(block.strong ? `**${block.text}**` : block.text, '')
        } else if (block.kind === 'bullets') {
          lines.push(...block.items.map((item) => `- ${item}`), '')
        } else if (block.kind === 'numbered') {
          lines.push(...block.items.map((item, index) => `${index + 1}. ${item}`), '')
        } else if (block.kind === 'note') {
          lines.push(...mdNote(block.note, labels))
        } else if (block.kind === 'table') {
          lines.push(...mdTable(block.columns, block.rows), '')
        } else if (block.kind === 'chart' && block.image?.url) {
          lines.push(`![${labels.chart}](${block.image.url})`, '')
        } else if (block.kind === 'flow' && block.image?.url) {
          lines.push(`![${labels.diagram}](${block.image.url})`, '')
        } else if (block.kind === 'chart') {
          const width = Math.max(...block.rows.map((row) => row.label.length))
          lines.push('```text', ...block.rows.map((row) => {
            const filled = Math.round(Math.max(0, Math.min(5, row.value)))
            return `${row.label.padEnd(width)}  ${'█'.repeat(filled)}${'░'.repeat(5 - filled)}  ${row.value}/5`
          }), '```', '')
        } else if (block.kind === 'flow') {
          lines.push(block.steps.join(' → '), '')
        } else if (block.kind === 'sources') {
          lines.push(...block.items.map((item) => `- ${item.title} : ${item.url}`), '')
        }
      }
    })
  })
  return lines.join('\n')
}

function htmlBlock(block: Block, labels: Labels): string {
  if (block.kind === 'paragraph') return block.strong ? `<p><strong>${esc(block.text)}</strong></p>` : `<p>${esc(block.text)}</p>`
  if (block.kind === 'bullets') return `<ul>${block.items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
  if (block.kind === 'numbered') return `<ol>${block.items.map((item) => `<li>${esc(item)}</li>`).join('')}</ol>`
  if (block.kind === 'note') {
    const label = block.note.tone === 'tip' ? labels.noteTip : block.note.tone === 'warning' ? labels.noteWarning : labels.noteInfo
    return `<aside class="note ${block.note.tone}"><p class="note-title">${esc(label)} · ${esc(block.note.title)}</p>${block.note.text ? `<p>${esc(block.note.text)}</p>` : ''}${block.note.items?.length ? `<ul>${block.note.items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}</aside>`
  }
  if (block.kind === 'table') {
    return `<table><thead><tr>${block.columns.map((column) => `<th>${esc(column)}</th>`).join('')}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
  }
  if (block.kind === 'chart') return barChartSvg(block.rows)
  if (block.kind === 'flow') return flowSvg(block.steps)
  return `<ul class="sources">${block.items.map((item) => `<li><a href="${esc(item.url)}" target="_blank" rel="noreferrer">${esc(item.title)}</a></li>`).join('')}</ul>`
}

function toHtml(doc: Doc, labels: Labels): string {
  const cover = doc.coverUrl ?? doc.coverDataUri
  const toc = doc.parts.map((part, index) => `<li>${esc(`${labels.part} ${index + 1} · ${part.title}`)}</li>`).join('')
  const parts = doc.parts
    .map(
      (part, partIndex) => `<section class="part"><h1>${esc(`${labels.part} ${partIndex + 1} · ${part.title}`)}</h1>${part.sections
        .map((section, sectionIndex) => `<section class="sub"><h2>${esc(`${partIndex + 1}.${sectionIndex + 1} ${section.title}`)}</h2>${section.blocks.map((block) => htmlBlock(block, labels)).join('')}</section>`)
        .join('')}</section>`,
    )
    .join('')
  return `<!doctype html>
<html lang="${doc.lang}"><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>
@page { size: A4; margin: 2cm 2cm 2.2cm; @bottom-right { content: counter(page) " / " counter(pages); font-size: 9pt; color: #64748b; } }
body{font-family:system-ui,sans-serif;max-width:920px;margin:40px auto;padding:0 24px;color:#0f172a;line-height:1.6}
.cover{min-height:92vh;display:flex;flex-direction:column;justify-content:center;page-break-after:always}
.cover .flag{font-size:56px;line-height:1}
.cover h1{font-size:34px;margin:12px 0 6px}
.cover .meta{color:#64748b;font-size:13px}
.cover img{max-width:100%;border-radius:16px;margin-top:28px}
.toc{page-break-after:always}
.toc ol{padding-left:20px;font-size:15px;line-height:2}
.part{page-break-before:always}
h1{font-size:24px;border-bottom:2px solid #${ACCENT};padding-bottom:6px;margin-top:0}
h2{font-size:17px;margin-top:26px}
p{margin:6px 0}
table{width:100%;border-collapse:collapse;font-size:13px;margin:10px 0}
td,th{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left}
th{background:#f1f5f9}
svg{max-width:100%;height:auto;margin:8px 0}
.note{border-radius:12px;padding:10px 14px;margin:12px 0;font-size:14px}
.note p{margin:4px 0}.note-title{font-weight:600}
.note.info{background:#eff6ff}.note.tip{background:#ecfdf5}.note.warning{background:#fff7ed}
.sources li{word-break:break-all;font-size:13px}
@media print{body{margin:0;max-width:none;padding:0}}
</style></head><body>
<div class="cover">
  <div class="flag">${esc(doc.flag)}</div>
  <h1>${esc(labels.cover)}</h1>
  <p class="meta">${esc(doc.countryName)} · ${esc(doc.domain)}</p>
  <p class="meta">${esc(labels.date)} : ${esc(doc.date)} · ${esc(labels.runBy)} : ${esc(doc.runBy)}</p>
  <p class="meta">${esc(labels.composite)} : <strong>${esc(doc.composite)}/5</strong> · ${esc(labels.average)} : <strong>${esc(doc.average)}/5</strong></p>
  ${cover ? `<img src="${cover}" alt="${esc(labels.cover)}">` : ''}
</div>
<nav class="toc"><h1>${esc(labels.toc)}</h1><ol>${toc}</ol></nav>
${parts}
</body></html>`
}

/** A PNG figure for Word, centred, with its caption. */
function imageBlocks(png: Buffer, caption: string): Array<Record<string, unknown>> {
  return [{ type: 'image', data: png.toString('base64'), width: 620, caption }]
}

function toDocxBlocks(doc: Doc, labels: Labels, withImages = true) {
  const blocks: Array<Record<string, unknown>> = [
    ...(withImages && doc.coverDocx ? [{ type: 'image', data: doc.coverDocx, width: 440 }] : []),
    { type: 'paragraph', text: `${doc.flag} ${doc.countryName}`, size: 22, bold: true },
    { type: 'paragraph', text: labels.cover, size: 16 },
    { type: 'callout', text: `${labels.date} : ${doc.date} · ${labels.runBy} : ${doc.runBy} · ${labels.composite} : ${doc.composite}/5`, tone: 'info' },
    { type: 'page_break' },
    { type: 'heading', text: labels.toc, level: 1 },
    { type: 'numbered', items: doc.parts.map((part, index) => `${labels.part} ${index + 1} · ${part.title}`) },
    { type: 'page_break' },
  ]
  doc.parts.forEach((part, partIndex) => {
    if (partIndex > 0) blocks.push({ type: 'page_break' })
    blocks.push({ type: 'heading', text: `${labels.part} ${partIndex + 1} · ${part.title}`, level: 1 })
    part.sections.forEach((section, sectionIndex) => {
      blocks.push({ type: 'heading', text: `${partIndex + 1}.${sectionIndex + 1} ${section.title}`, level: 2 })
      for (const block of section.blocks) blocks.push(...docxBlock(block, labels, withImages))
    })
  })
  return blocks
}

function docxBlock(block: Block, labels: Labels, withImages: boolean): Array<Record<string, unknown>> {
  if (block.kind === 'paragraph') return [{ type: 'paragraph', text: block.text.slice(0, 4900), size: 10.5, bold: block.strong ?? false }]
  if (block.kind === 'bullets') return [{ type: 'bullets', items: block.items.slice(0, 200).map((item) => item.slice(0, 1000)) }]
  if (block.kind === 'numbered') return [{ type: 'numbered', items: block.items.slice(0, 200) }]
  if (block.kind === 'note') {
    const tone = block.note.tone === 'tip' ? 'success' : block.note.tone === 'warning' ? 'warning' : 'info'
    const label = block.note.tone === 'tip' ? labels.noteTip : block.note.tone === 'warning' ? labels.noteWarning : labels.noteInfo
    const out: Array<Record<string, unknown>> = [{ type: 'callout', text: `${label} · ${block.note.title}${block.note.text ? ` : ${block.note.text}` : ''}`.slice(0, 1990), tone }]
    if (block.note.items?.length) out.push({ type: 'bullets', items: block.note.items.slice(0, 200).map((item) => item.slice(0, 1000)) })
    return out
  }
  if (block.kind === 'table') {
    return [{ type: 'table', columns: block.columns, rows: block.rows, widths: block.widths, zebra: true }]
  }
  if (withImages && block.kind === 'chart' && block.image) return imageBlocks(block.image.png, labels.chart)
  if (withImages && block.kind === 'flow' && block.image) return imageBlocks(block.image.png, labels.diagram)
  if (block.kind === 'chart') {
    // A shaded grid: five cells per dimension, filled up to the score.
    const rows = block.rows.map((row) => {
      const filled = Math.round(Math.max(0, Math.min(5, row.value)))
      return [
        row.label,
        ...Array.from({ length: 5 }, (_, index) => ({ text: '', fill: index < filled ? ACCENT : 'E2E8F0' })),
        `${row.value}/5`,
      ]
    })
    return [{ type: 'table', columns: [labels.dimension, '1', '2', '3', '4', '5', labels.score], rows, widths: [4, 1, 1, 1, 1, 1, 1.5] }]
  }
  if (block.kind === 'flow') return [{ type: 'numbered', items: block.steps }]
  return [{ type: 'bullets', items: block.items.slice(0, 200).map((item) => `${item.title} : ${item.url}`.slice(0, 1000)) }]
}
