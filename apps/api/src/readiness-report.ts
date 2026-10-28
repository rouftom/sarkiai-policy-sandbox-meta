/**
 * Report of one AI-readiness assessment, in Markdown or as a self-contained HTML
 * page (print it to PDF from the browser).
 *
 * Three resources are added when they are available, each with its own status
 * in the report, so a reader sees what was produced and what was not:
 *  - a chart of the 13 scores, from the charts MCP server;
 *  - a diagram of the process, from the Excalidraw MCP server;
 *  - a cover illustration, from Meta Image (muse-image-1.0), or a labelled sample.
 * MCP tools are discovered at call time (tools/list), so the report never
 * depends on a tool name being hard-coded.
 */

import type { McpGateway, McpToolSummary } from './mcp.js'
import { referenceImage, type GeneratedImage, type ImageGenerationOptions } from '@sps/agents'
import type { ReadinessRun } from './readiness-runs.js'

export type ReportFormat = 'markdown' | 'html'

export interface ReportAsset {
  kind: 'chart' | 'diagram' | 'cover'
  status: 'included' | 'unavailable' | 'fallback'
  tool?: string
  message: string
}

export interface GeneratedReport {
  filename: string
  mime: string
  content: string
  assets: ReportAsset[]
}

interface Figure {
  dataUri: string
  alt: string
}

/** The first image an MCP tool returned, as a data URI (MCP `image` content). */
function imageOf(result: unknown): string | undefined {
  const content = (result as { content?: Array<{ type?: string; data?: string; mimeType?: string }> } | undefined)?.content ?? []
  const image = content.find((item) => item.type === 'image' && item.data)
  return image?.data ? `data:${image.mimeType ?? 'image/png'};base64,${image.data}` : undefined
}

async function mcpFigure(
  mcp: McpGateway | undefined,
  server: string,
  pattern: RegExp,
  args: Record<string, unknown>,
  kind: 'chart' | 'diagram',
  alt: string,
): Promise<{ asset: ReportAsset; figure?: Figure }> {
  if (!mcp) return { asset: { kind, status: 'unavailable', message: 'MCP gateway not configured' } }
  try {
    const tools: McpToolSummary[] = await mcp.listTools(server)
    const tool = tools.find((entry) => pattern.test(entry.name))
    if (!tool) return { asset: { kind, status: 'unavailable', message: `${server} exposes no matching tool` } }
    const result = await mcp.callTool(server, tool.name, args)
    const dataUri = imageOf(result.result)
    if (!dataUri) return { asset: { kind, status: 'unavailable', tool: tool.name, message: 'the tool answered without an image' } }
    return { asset: { kind, status: 'included', tool: tool.name, message: 'rendered' }, figure: { dataUri, alt } }
  } catch (error) {
    return { asset: { kind, status: 'unavailable', message: (error as Error).message.slice(0, 160) } }
  }
}

async function coverFigure(run: ReadinessRun, options: ImageGenerationOptions | null): Promise<{ asset: ReportAsset; figure: Figure }> {
  const title = `Maturité IA · ${run.country.toUpperCase()}`
  const image: GeneratedImage = await referenceImage(
    `A clean editorial cover illustration for a national AI readiness report on ${run.domain.replace(/_/g, ' ')} in ${run.country.toUpperCase()}. Abstract, calm, flat vector style, no text.`,
    { title, lines: ['13 dimensions', 'Scores 0 to 5'] },
    options,
  )
  return {
    asset: {
      kind: 'cover',
      status: image.source === 'meta-image' ? 'included' : 'fallback',
      tool: image.model,
      message: image.source === 'meta-image' ? 'generated with Meta Image' : 'labelled sample (Meta Image not configured or unavailable)',
    },
    figure: { dataUri: `data:${image.mime};base64,${image.dataBase64}`, alt: title },
  }
}

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function buildReadinessReport(
  run: ReadinessRun,
  options: { format: ReportFormat; mcp?: McpGateway; image: ImageGenerationOptions | null; generatedAt?: string },
): Promise<GeneratedReport> {
  const { report } = run
  const composite = report.scenario?.composite ?? null
  const date = (options.generatedAt ?? new Date().toISOString()).slice(0, 16).replace('T', ' ')
  const labels = report.scores.map((score) => score.dimensionName)
  const values = report.scores.map((score) => score.score)

  const [chart, diagram, cover] = await Promise.all([
    mcpFigure(options.mcp, 'sarkiai_charts', /chart|bar|graph/i, { type: 'bar', title: 'Maturité IA · scores 0 à 5', labels, values, series: [{ name: 'score', data: values }] }, 'chart', 'Scores par dimension'),
    mcpFigure(
      options.mcp,
      'sea_mcp_excalidraw',
      /create|draw|diagram|scene|element/i,
      {
        title: 'Processus d’évaluation',
        description: `Start → live web search → ${report.scores.length} agents → synthesis → saved`,
        elements: [
          { type: 'rectangle', text: 'Départ' },
          { type: 'rectangle', text: 'Recherche web' },
          ...report.scores.map((score) => ({ type: 'rectangle', text: score.dimensionName })),
          { type: 'rectangle', text: 'Synthèse' },
        ],
      },
      'diagram',
      'Processus d’évaluation',
    ),
    coverFigure(run, options.image),
  ])
  const assets: ReportAsset[] = [chart.asset, diagram.asset, cover.asset]
  const figures = [cover.figure, chart.figure, diagram.figure].filter((figure): figure is Figure => Boolean(figure))
  const webSources = [...new Map(report.scores.flatMap((score) => score.webSources ?? []).map((source) => [source.url, source])).values()]
  const base = `maturite-ia-${run.country}-${run.createdAt.slice(0, 10)}`

  if (options.format === 'markdown') {
    const lines = [
      `# Maturité IA — ${run.country.toUpperCase()} · ${run.domain}`,
      '',
      `Date : ${date} · Évaluée par : ${run.runBy} · Composite : ${composite ?? '—'}/5`,
      '',
      report.summary,
      '',
      ...figures.map((figure) => `![${figure.alt}](${figure.dataUri})`),
      '',
      '## Scores',
      '',
      '| # | Dimension | Score | Maturité | Confiance |',
      '| --- | --- | --- | --- | --- |',
      ...report.scores.map((score) => `| D${score.dimensionId} | ${score.dimensionName} | ${score.score}/5 | ${score.maturity} | ${Math.round(score.confidence * 100)} % |`),
      '',
      '## Recommandations',
      '',
      ...report.scores.flatMap((score) => [`### ${score.dimensionName}`, '', ...(score.recommendations ?? []).map((item) => `- ${item}`), '']),
      '## Lacunes',
      '',
      ...report.scores.flatMap((score) => (score.gaps?.length ? [`### ${score.dimensionName}`, '', ...score.gaps.map((item) => `- ${item}`), ''] : [])),
      '## Sources web consultées',
      '',
      ...(webSources.length ? webSources.map((source) => `- [${source.title}](${source.url})`) : ['Aucune source web consultée.']),
      '',
      '## Figures',
      '',
      ...assets.map((asset) => `- ${asset.kind} : ${asset.status}${asset.tool ? ` (${asset.tool})` : ''} — ${asset.message}`),
      '',
    ]
    return { filename: `${base}.md`, mime: 'text/markdown; charset=utf-8', content: lines.join('\n'), assets }
  }

  const rows = report.scores
    .map(
      (score) =>
        `<tr><td>D${score.dimensionId}</td><td>${esc(score.dimensionName)}</td><td>${score.score}/5</td><td>${esc(score.maturity)}</td><td>${Math.round(score.confidence * 100)} %</td></tr>`,
    )
    .join('')
  const recs = report.scores
    .map(
      (score) =>
        `<section><h3>${esc(score.dimensionName)}</h3><ul>${(score.recommendations ?? []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul></section>`,
    )
    .join('')
  const gaps = report.scores
    .filter((score) => score.gaps?.length)
    .map((score) => `<section><h3>${esc(score.dimensionName)}</h3><ul>${score.gaps.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></section>`)
    .join('')
  const sources = webSources.length
    ? `<ul>${webSources.map((source) => `<li><a href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(source.title)}</a></li>`).join('')}</ul>`
    : '<p>Aucune source web consultée.</p>'
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(base)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:920px;margin:40px auto;padding:0 24px;color:#0f172a;line-height:1.55}
h1{font-size:26px;margin-bottom:4px}h2{font-size:18px;margin-top:32px;border-bottom:1px solid #e2e8f0;padding-bottom:6px}h3{font-size:14px;margin:16px 0 4px}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left}
img{max-width:100%;border-radius:12px;margin:12px 0}.meta{color:#64748b;font-size:13px}
@media print{body{margin:0}}
</style></head><body>
<h1>Maturité IA — ${esc(run.country.toUpperCase())} · ${esc(run.domain)}</h1>
<p class="meta">Date : ${esc(date)} · Évaluée par : ${esc(run.runBy)} · Composite : ${composite ?? '—'}/5</p>
<p>${esc(report.summary)}</p>
${figures.map((figure) => `<img src="${figure.dataUri}" alt="${esc(figure.alt)}">`).join('\n')}
<h2>Scores</h2>
<table><thead><tr><th>#</th><th>Dimension</th><th>Score</th><th>Maturité</th><th>Confiance</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Recommandations</h2>${recs}
<h2>Lacunes</h2>${gaps || '<p>Aucune lacune relevée.</p>'}
<h2>Sources web consultées</h2>${sources}
<h2>Figures</h2><ul>${assets.map((asset) => `<li>${esc(asset.kind)} : ${esc(asset.status)}${asset.tool ? ` (${esc(asset.tool)})` : ''} — ${esc(asset.message)}</li>`).join('')}</ul>
</body></html>`
  return { filename: `${base}.html`, mime: 'text/html; charset=utf-8', content: html, assets }
}
