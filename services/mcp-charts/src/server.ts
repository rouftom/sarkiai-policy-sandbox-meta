import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { CHART_CATALOG, CHART_TYPES, PALETTES, type ChartType } from "./chart-catalog.js";
import { compatibleTypes, numericKeysOf, resolveKeys, stringKeysOf } from "./chart-compat.js";

export const SERVER_INFO = { name: "sea-mcp-charts", version: "1.2.1" } as const;

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "..", "dist")
  : import.meta.dirname;

const MAX_DATA_POINTS = 5000;
const MAX_DASHBOARD_CHARTS = 12;
const RESOURCE_URI = "ui://sarkiai-charts/mcp-app.html";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const seriesSchema = z.object({
  key: z.string().describe("Data key (property name) for this series. Must match a numeric key in the data objects."),
  color: z.string().optional().describe("CSS color for this series (hex recommended)"),
  name: z.string().optional().describe("Display name in legend and tooltip"),
  type: z.enum(["bar", "line", "area"]).optional().describe("Series renderer in composed charts"),
  stackId: z.string().optional().describe("Series sharing the same stackId are stacked"),
  yAxis: z.enum(["left", "right"]).optional().describe("Axis used by the series (composed/line/bar charts)"),
  dashed: z.boolean().optional().describe("Render lines with a dashed stroke (e.g. forecasts)"),
});

const referenceLineSchema = z.object({
  axis: z.enum(["x", "y"]).default("y").describe("'y' draws a horizontal line at a value, 'x' a vertical line at a category"),
  value: z.union([z.number(), z.string()]).describe("Position of the line"),
  label: z.string().optional(),
  color: z.string().optional(),
});

const configSchema = z.object({
  title: z.string().optional().describe("Chart title"),
  subtitle: z.string().optional().describe("Secondary line under the title (source, period...)"),
  xAxisKey: z.string().optional().describe("Category / X axis key (defaults to the first string key)"),
  yAxisKey: z.string().optional().describe("Y key for scatter/bubble charts"),
  zAxisKey: z.string().optional().describe("Size key for bubble charts"),
  labelKey: z.string().optional().describe("Key used for point labels (scatter/bubble)"),
  nameKey: z.string().optional().describe("Name key for pie/donut/funnel/treemap/radial (defaults to 'name' or first string key)"),
  valueKey: z.string().optional().describe("Value key for pie/donut/funnel/treemap/radial (defaults to 'value' or first numeric key)"),
  ohlc: z.object({ open: z.string(), high: z.string(), low: z.string(), close: z.string() }).partial().optional()
    .describe("Custom keys for candlestick data (defaults: open/high/low/close)"),
  locale: z.string().optional().describe("BCP-47 locale for UI and number formatting, e.g. 'fr-FR', 'en-US'"),
  series: z.array(seriesSchema).optional().describe("Series configuration. If omitted, every numeric key is displayed."),
  palette: z.enum(Object.keys(PALETTES) as [string, ...string[]]).optional().describe("Named color palette"),
  colors: z.array(z.string()).optional().describe("Custom color palette (overrides `palette`)"),
  stacked: z.boolean().optional().describe("Stack bar/area series"),
  mirror: z.boolean().optional().describe("Population pyramid: mirror the first series to the left automatically"),
  curve: z.enum(["monotone", "linear", "step", "natural"]).optional().describe("Line/area interpolation"),
  sort: z.enum(["none", "asc", "desc"]).optional().describe("Sort data by the first series value"),
  limit: z.number().int().positive().optional().describe("Keep only the first N rows (after sorting) – useful for top-N charts"),
  showLegend: z.boolean().optional(),
  showGrid: z.boolean().optional(),
  showDataLabels: z.boolean().optional().describe("Display values on bars/points/slices"),
  showDots: z.boolean().optional().describe("Display dots on lines"),
  animate: z.boolean().optional().describe("Enable entry animations (default true)"),
  valueFormat: z.enum(["number", "compact", "percent", "currency"]).optional()
    .describe("Value formatting. 'percent' expects ratios (0.25 = 25%) unless values are > 1"),
  currency: z.string().optional().describe("ISO 4217 code used with valueFormat='currency' (e.g. 'XOF', 'EUR', 'USD')"),
  decimals: z.number().int().min(0).max(6).optional().describe("Max fraction digits"),
  unit: z.string().optional().describe("Suffix appended to values (e.g. 'kg', 'MW')"),
  xAxisLabel: z.string().optional(),
  yAxisLabel: z.string().optional(),
  yAxisDomain: z.tuple([z.union([z.number(), z.literal("auto")]), z.union([z.number(), z.literal("auto")])]).optional()
    .describe("Y axis bounds, e.g. [0, 100] or [0, 'auto']"),
  referenceLines: z.array(referenceLineSchema).optional().describe("Targets, thresholds or events"),
  height: z.number().int().min(160).max(1200).optional().describe("Chart height in pixels (default fits the view)"),
}).describe("Chart configuration (axes, series, formatting, display options)");

const chartSpecShape = {
  type: z.enum(CHART_TYPES).describe("The type of chart to display. Call sarkiai_charts_list_chart_types for details."),
  data: z.array(z.record(z.string(), z.any())).min(1).describe("Rows to visualize (array of flat objects; treemap also accepts `children`)."),
  config: configSchema.optional(),
};
const chartSpecSchema = z.object(chartSpecShape);
type ChartSpec = z.infer<typeof chartSpecSchema>;

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

const NUMERIC_STRING = /^\s*-?\d+(?:[.,]\d+)?\s*$/;

/** Converts numeric strings ("42", "3.5") into numbers so charts render correctly. */
function coerceRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "string" && NUMERIC_STRING.test(v)) out[k] = Number(v.replace(",", "."));
    else if (k === "children" && Array.isArray(v)) out[k] = v.map((c) => (c && typeof c === "object" ? coerceRow(c) : c));
    else out[k] = v;
  }
  return out;
}

interface SeriesStats { key: string; count: number; min: number; max: number; sum: number; avg: number; first: number; last: number; changePct: number | null }

function computeStats(data: Record<string, any>[], keys: string[]): SeriesStats[] {
  return keys.map((key) => {
    const values = data.map((r) => r[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) return { key, count: 0, min: 0, max: 0, sum: 0, avg: 0, first: 0, last: 0, changePct: null };
    const sum = values.reduce((a, b) => a + b, 0);
    const first = values[0];
    const last = values[values.length - 1];
    return {
      key,
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      sum: round(sum),
      avg: round(sum / values.length),
      first,
      last,
      changePct: first !== 0 ? round(((last - first) / Math.abs(first)) * 100) : null,
    };
  });
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Normalizes, validates and enriches a chart spec. */
function prepareChart(spec: ChartSpec): { chart: any; stats: SeriesStats[]; warnings: string[]; error?: string } {
  const warnings: string[] = [];
  let data = spec.data.filter((r) => r && typeof r === "object").map(coerceRow);

  if (data.length === 0) return { chart: null, stats: [], warnings, error: "`data` must contain at least one object." };
  if (data.length > MAX_DATA_POINTS) {
    warnings.push(`Data truncated from ${data.length} to ${MAX_DATA_POINTS} rows.`);
    data = data.slice(0, MAX_DATA_POINTS);
  }

  const keys = resolveKeys(spec.type, data, spec.config ?? {});
  if (!keys.ok) {
    const alternatives = compatibleTypes(data, spec.config ?? {}).slice(0, 6);
    return {
      chart: null,
      stats: [],
      warnings,
      error: `${spec.type} : ${keys.reason} Types compatibles avec ces données : ${alternatives.join(", ") || "aucun"}.`,
    };
  }

  const config: Record<string, any> = { ...(spec.config ?? {}) };
  config.xAxisKey = keys.xKey;
  if (spec.config?.series?.length) {
    const dropped = spec.config.series.filter((s) => !keys.series.some((k) => k.key === s.key)).map((s) => s.key);
    if (dropped.length) warnings.push(`Series ignored (not numeric or missing): ${dropped.join(", ")}. Available numeric keys: ${numericKeysOf(data).join(", ") || "none"}.`);
  }
  config.series = keys.series;
  if (spec.config?.xAxisKey && spec.config.xAxisKey !== keys.xKey) warnings.push(`xAxisKey "${spec.config.xAxisKey}" not found; using "${keys.xKey}".`);

  if (config.sort && config.sort !== "none" && keys.series[0]) {
    const k = keys.series[0].key;
    data = [...data].sort((a, b) => (config.sort === "asc" ? 1 : -1) * ((a[k] ?? 0) - (b[k] ?? 0)));
  }
  if (config.limit && data.length > config.limit) data = data.slice(0, config.limit);

  const seriesKeys = keys.series.map((s) => s.key);
  const stats = computeStats(data, seriesKeys.length ? seriesKeys : [keys.valueKey]);
  return { chart: { type: spec.type, data, config }, stats, warnings };
}

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(round(n)));

function summarize(chart: any, stats: SeriesStats[], warnings: string[]): string {
  const title = chart.config?.title ? `"${chart.config.title}" ` : "";
  const lines = [`Displayed ${title}${CHART_CATALOG[chart.type as ChartType].label.toLowerCase()} chart (${chart.type}) with ${chart.data.length} data points.`];
  for (const s of stats.filter((s) => s.count > 0)) {
    const change = s.changePct === null ? "" : `, change first→last ${s.changePct > 0 ? "+" : ""}${s.changePct}%`;
    lines.push(`- ${s.key}: min ${fmt(s.min)}, max ${fmt(s.max)}, avg ${fmt(s.avg)}, total ${fmt(s.sum)}${change}`);
  }
  if (warnings.length) lines.push(`Warnings: ${warnings.join(" ")}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Chart suggestion heuristics
// ---------------------------------------------------------------------------

const GOALS = ["auto", "trend", "comparison", "composition", "distribution", "correlation", "ranking", "flow", "finance"] as const;

function suggestChart(data: Record<string, any>[], goal: (typeof GOALS)[number]) {
  const rows = data.map(coerceRow);
  const numeric = numericKeysOf(rows);
  const strings = stringKeysOf(rows);
  const keys = new Set(rows.flatMap((r) => Object.keys(r)));
  const x = strings[0] ?? Object.keys(rows[0] ?? {})[0];
  const timeLike = x ? /date|time|year|month|day|week|quarter|period|jour|mois|ann[ée]e|semaine/i.test(x) : false;
  const hasOhlc = ["open", "high", "low", "close"].every((k) => keys.has(k));
  const hasChildren = rows.some((r) => Array.isArray(r.children));
  const n = rows.length;

  let type: ChartType;
  let reason: string;
  if (goal === "finance" || hasOhlc) { type = "candlestick"; reason = "Rows contain open/high/low/close values."; }
  else if (hasChildren) { type = "treemap"; reason = "Hierarchical data (children arrays)."; }
  else if (goal === "correlation" || (numeric.length >= 2 && strings.length <= 1 && goal === "auto" && !timeLike && n > 8)) {
    type = numeric.length >= 3 ? "bubble" : "scatter_with_labels"; reason = "Relationship between numeric variables.";
  }
  else if (goal === "flow") { type = "funnel"; reason = "Sequential stages with decreasing values."; }
  else if (goal === "composition") {
    if (numeric.length === 1 && n <= 8) { type = "custom_active_pie"; reason = "Part-to-whole with few categories."; }
    else if (timeLike) { type = "stacked_area"; reason = "Composition evolving over time."; }
    else { type = "ranged_stacked_bar"; reason = "Composition per category."; }
  }
  else if (goal === "ranking") { type = "horizontal_bar"; reason = "Ranked categories read best horizontally."; }
  else if (goal === "distribution") { type = "simple_bar"; reason = "Distribution across buckets."; }
  else if (goal === "trend" || timeLike) { type = numeric.length > 3 ? "line_chart_padding" : n > 24 ? "simple_area" : "line_chart_padding"; reason = "Ordered/time dimension: lines show trends best."; }
  else if (numeric.length >= 3 && n <= 12 && n >= 3) { type = "simple_radar"; reason = "Several metrics compared across a few entities."; }
  else if (numeric.length === 1 && n <= 6) { type = "custom_active_pie"; reason = "Single metric over a handful of categories."; }
  else { type = (x && rows.some((r) => String(r[x] ?? "").length > 14)) ? "horizontal_bar" : "simple_bar"; reason = "Comparison across categories."; }

  const alternatives = ([
    "simple_bar", "line_chart_padding", "horizontal_bar", "custom_active_pie", "stacked_area", "line_bar_area_composed",
  ] as ChartType[]).filter((t) => t !== type).slice(0, 3);

  return {
    type,
    reason,
    config: { xAxisKey: x, series: numeric.filter((k) => k !== x).slice(0, 6).map((key) => ({ key })) },
    alternatives,
    detected: { rows: n, numericKeys: numeric, categoryKeys: strings, timeLike },
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const OPTIONS_DOC = `## Config options (all optional)
- title, subtitle, xAxisLabel, yAxisLabel
- xAxisKey, yAxisKey, zAxisKey, labelKey, nameKey, valueKey, ohlc {open,high,low,close}
- series: [{ key, name, color, type: bar|line|area, stackId, yAxis: left|right, dashed }]
- palette: ${Object.keys(PALETTES).join(" | ")} — or colors: ["#hex", ...]
- stacked, mirror (pyramid), curve: monotone|linear|step|natural, sort: none|asc|desc, limit
- showLegend, showGrid, showDataLabels, showDots, animate
- valueFormat: number|compact|percent|currency, currency (ISO code), decimals, unit, locale
- yAxisDomain: [min|'auto', max|'auto'], referenceLines: [{ axis: x|y, value, label, color }], height (px)`;

/**
 * Registers Chart tools and resources with the MCP server.
 */
export function registerTools(server: McpServer, distDir: string): void {
  const templatesUri = "docs://charts/templates";
  const readmeUri = "docs://charts/readme";
  const typesUri = "docs://charts/types";

  // 1. Single chart --------------------------------------------------------
  registerAppTool(server,
    "sarkiai_charts_display_chart",
    {
      title: "Display Chart",
      description: `Displays a premium animated, interactive chart (Recharts) in the UI. Supports ${CHART_TYPES.length} chart types (line, area, bar, stacked, pyramid, candlestick, composed, scatter, bubble, pie/donut, radar, radial, treemap, funnel), custom palettes, number/currency formatting, reference lines and secondary axes. Returns descriptive statistics for each series. Use sarkiai_charts_list_chart_types to see data shapes, or sarkiai_charts_suggest_chart if unsure which type fits.`,
      inputSchema: chartSpecShape,
      annotations: { readOnlyHint: true, openWorldHint: false, title: "Display Chart" },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (args: any): Promise<CallToolResult> => {
      const { chart, stats, warnings, error } = prepareChart(args as ChartSpec);
      if (error) return { content: [{ type: "text", text: `Chart error: ${error}${warnings.length ? `\nWarnings: ${warnings.join(" ")}` : ""}` }], isError: true };
      return {
        content: [{ type: "text", text: summarize(chart, stats, warnings) }],
        structuredContent: { mode: "chart", ...chart, stats, warnings },
      };
    }
  );

  // 2. Dashboard -----------------------------------------------------------
  registerAppTool(server,
    "sarkiai_charts_display_dashboard",
    {
      title: "Display Chart Dashboard",
      description: `Displays several charts at once in a responsive grid (max ${MAX_DASHBOARD_CHARTS}), with optional KPI cards. Each chart accepts the same { type, data, config } as sarkiai_charts_display_chart.`,
      inputSchema: {
        title: z.string().optional().describe("Dashboard title"),
        subtitle: z.string().optional(),
        columns: z.number().int().min(1).max(4).optional().describe("Grid columns on wide screens (default 2)"),
        kpis: z.array(z.object({
          label: z.string(),
          value: z.union([z.number(), z.string()]),
          delta: z.number().optional().describe("Variation in percent, e.g. 12.5 or -3"),
          unit: z.string().optional(),
        })).max(8).optional().describe("Headline KPI cards shown above the charts"),
        charts: z.array(chartSpecSchema).min(1).max(MAX_DASHBOARD_CHARTS),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, title: "Display Dashboard" },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (args: any): Promise<CallToolResult> => {
      const prepared = (args.charts as ChartSpec[]).map(prepareChart);
      const errors = prepared.map((p, i) => (p.error ? `#${i + 1}: ${p.error}` : null)).filter(Boolean);
      const ok = prepared.filter((p) => !p.error);
      if (ok.length === 0) return { content: [{ type: "text", text: `Dashboard error: ${errors.join(" ")}` }], isError: true };
      const text = [
        `Displayed dashboard${args.title ? ` "${args.title}"` : ""} with ${ok.length} chart(s)${args.kpis?.length ? ` and ${args.kpis.length} KPI(s)` : ""}.`,
        ...ok.map((p) => summarize(p.chart, p.stats, p.warnings)),
        ...(errors.length ? [`Skipped charts: ${errors.join(" ")}`] : []),
      ].join("\n\n");
      return {
        content: [{ type: "text", text }],
        structuredContent: {
          mode: "dashboard",
          title: args.title,
          subtitle: args.subtitle,
          columns: args.columns ?? 2,
          kpis: args.kpis ?? [],
          charts: ok.map((p) => ({ ...p.chart, stats: p.stats, warnings: p.warnings })),
        },
      };
    }
  );

  // 3. Catalog (tools-only clients, e.g. Anthropic MCP connector, cannot read resources)
  server.registerTool(
    "sarkiai_charts_list_chart_types",
    {
      title: "List Chart Types",
      description: "Returns every supported chart type with its description, expected data shape, an example payload, and all config options. Call this before displaying an unfamiliar chart type.",
      inputSchema: {
        type: z.enum(CHART_TYPES).optional().describe("Only return details for this chart type"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ type }): Promise<CallToolResult> => {
      const entries = type ? { [type]: CHART_CATALOG[type] } : CHART_CATALOG;
      return {
        content: [{ type: "text", text: `${JSON.stringify(entries, null, 2)}\n\n${OPTIONS_DOC}` }],
        structuredContent: { types: entries, palettes: Object.keys(PALETTES) },
      };
    }
  );

  // 4. Suggestion ------------------------------------------------------------
  server.registerTool(
    "sarkiai_charts_suggest_chart",
    {
      title: "Suggest Chart",
      description: "Analyzes a data sample and recommends the most suitable chart type and a ready-to-use config for sarkiai_charts_display_chart.",
      inputSchema: {
        data: z.array(z.record(z.string(), z.any())).min(1).describe("Data rows (a sample of up to ~50 rows is enough)"),
        goal: z.enum(GOALS).optional().describe("What the chart should communicate (default auto)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ data, goal }): Promise<CallToolResult> => {
      const suggestion = suggestChart(data.slice(0, 200), goal ?? "auto");
      return {
        content: [{ type: "text", text: JSON.stringify(suggestion, null, 2) }],
        structuredContent: suggestion,
      };
    }
  );

  // UI Resource --------------------------------------------------------------
  let cachedHtml: string | null = null;
  registerAppResource(server,
    "sarkiai_charts_ui",
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE, description: "Interactive chart viewer" },
    async (): Promise<ReadResourceResult> => {
      if (!cachedHtml) {
        for (const p of [path.join(distDir, "mcp-app.html"), path.join(distDir, "src", "mcp-app.html")]) {
          try { cachedHtml = await fs.readFile(p, "utf-8"); break; } catch { continue; }
        }
      }
      if (!cachedHtml) throw new Error("Could not find mcp-app.html");

      return {
        contents: [{
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: cachedHtml,
          _meta: {
            ui: {
              prefersBorder: true,
              permissions: { clipboardWrite: {} },
            },
          },
        }],
      };
    }
  );

  // Documentation Resources ----------------------------------------------------
  server.registerResource(
    "sarkiai_charts_readme",
    readmeUri,
    { mimeType: "text/markdown", description: "How to use the SarkiAI Charts server" },
    async () => ({
      contents: [{
        uri: readmeUri,
        mimeType: "text/markdown",
        text: [
          "# SarkiAI Charts MCP",
          "",
          "Premium data visualization tools using Recharts.",
          "",
          "## Tools",
          "- **sarkiai_charts_display_chart**: render one chart.",
          "- **sarkiai_charts_display_dashboard**: render a grid of charts + KPI cards.",
          "- **sarkiai_charts_list_chart_types**: catalog with data shapes and examples.",
          "- **sarkiai_charts_suggest_chart**: recommend a chart type for a dataset.",
          "",
          "## Chart types",
          ...CHART_TYPES.map((t) => `- **${t}** — ${CHART_CATALOG[t].description}`),
          "",
          OPTIONS_DOC,
        ].join("\n"),
      }],
    }),
  );

  server.registerResource("sarkiai_charts_types", typesUri, { mimeType: "application/json" }, async () => ({
    contents: [{
      uri: typesUri,
      mimeType: "application/json",
      text: JSON.stringify({
        types: CHART_TYPES,
        description: "List of available chart types for the sarkiai_charts_display_chart tool.",
      }, null, 2),
    }],
  }));

  server.registerResource("sarkiai_charts_templates", templatesUri, { mimeType: "application/json" }, async () => ({
    contents: [{
      uri: templatesUri,
      mimeType: "application/json",
      text: JSON.stringify(Object.fromEntries(CHART_TYPES.map((t) => [t, CHART_CATALOG[t].example])), null, 2),
    }],
  }));
}

export function createServer(): McpServer {
  const server = new McpServer(SERVER_INFO);
  registerTools(server, DIST_DIR);
  return server;
}
