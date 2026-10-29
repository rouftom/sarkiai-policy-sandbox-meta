/**
 * Single source of truth for the chart types supported by the server and the UI.
 * Keep this file free of Node/DOM specific imports: it is bundled in both.
 */

export const CHART_TYPES = [
  "line_chart_padding",
  "simple_area",
  "stacked_area",
  "simple_bar",
  "custom_shape_bar",
  "horizontal_bar",
  "ranged_stacked_bar",
  "population_pyramid",
  "candlestick",
  "line_bar_area_composed",
  "scatter_with_labels",
  "bubble",
  "custom_active_pie",
  "simple_pie",
  "simple_radar",
  "radial_bar",
  "treemap",
  "funnel",
] as const;

export type ChartType = (typeof CHART_TYPES)[number];

export interface ChartCatalogEntry {
  label: string;
  family: "cartesian" | "polar" | "hierarchy" | "finance";
  description: string;
  dataShape: string;
  example: { data: Record<string, unknown>[]; config?: Record<string, unknown> };
}

const MONTHS = [
  { name: "Jan", sales: 4000, costs: 2400, margin: 1600 },
  { name: "Feb", sales: 3000, costs: 1398, margin: 1602 },
  { name: "Mar", sales: 5000, costs: 3800, margin: 1200 },
  { name: "Apr", sales: 4780, costs: 3908, margin: 872 },
];

const SHARES = [
  { name: "Mobile", value: 54 },
  { name: "Desktop", value: 38 },
  { name: "Tablet", value: 8 },
];

export const CHART_CATALOG: Record<ChartType, ChartCatalogEntry> = {
  line_chart_padding: {
    label: "Line",
    family: "cartesian",
    description: "Line chart for trends over an ordered dimension (time, steps). Supports multiple series and curve styles.",
    dataShape: "[{ <xKey>: string, <series1>: number, <series2>: number, ... }]",
    example: { data: MONTHS, config: { xAxisKey: "name", series: [{ key: "sales" }, { key: "costs" }] } },
  },
  simple_area: {
    label: "Area",
    family: "cartesian",
    description: "Area chart emphasising volume of one or several overlapping series.",
    dataShape: "[{ <xKey>: string, <series>: number, ... }]",
    example: { data: MONTHS, config: { xAxisKey: "name", series: [{ key: "sales" }] } },
  },
  stacked_area: {
    label: "Stacked area",
    family: "cartesian",
    description: "Stacked area chart showing the contribution of each series to a total over time.",
    dataShape: "[{ <xKey>: string, <series1>: number, <series2>: number }]",
    example: { data: MONTHS, config: { xAxisKey: "name", series: [{ key: "costs" }, { key: "margin" }] } },
  },
  simple_bar: {
    label: "Bar",
    family: "cartesian",
    description: "Vertical bar chart comparing categories. Multiple series are grouped side by side (or stacked with config.stacked).",
    dataShape: "[{ <xKey>: string, <series>: number, ... }]",
    example: { data: MONTHS, config: { xAxisKey: "name", series: [{ key: "sales", color: "#6366f1" }] } },
  },
  custom_shape_bar: {
    label: "Bar (rounded)",
    family: "cartesian",
    description: "Bar chart with pill-shaped bars and one color per category (great for rankings).",
    dataShape: "[{ <xKey>: string, <value>: number }]",
    example: { data: SHARES, config: { xAxisKey: "name", series: [{ key: "value" }] } },
  },
  horizontal_bar: {
    label: "Horizontal bar",
    family: "cartesian",
    description: "Horizontal bars, ideal for long category labels and rankings.",
    dataShape: "[{ <categoryKey>: string, <series>: number }]",
    example: { data: SHARES, config: { xAxisKey: "name", series: [{ key: "value" }], sort: "desc" } },
  },
  ranged_stacked_bar: {
    label: "Stacked bar",
    family: "cartesian",
    description: "Stacked vertical bars showing composition per category.",
    dataShape: "[{ <xKey>: string, <part1>: number, <part2>: number }]",
    example: { data: MONTHS, config: { xAxisKey: "name", series: [{ key: "costs" }, { key: "margin" }] } },
  },
  population_pyramid: {
    label: "Pyramid",
    family: "cartesian",
    description: "Mirrored horizontal bars (e.g. male vs female per age group). Provide the left series as negative numbers, or set config.mirror=true to mirror the first series automatically.",
    dataShape: "[{ <groupKey>: string, <left>: number, <right>: number }]",
    example: {
      data: [
        { age: "0-14", male: 2100, female: 2000 },
        { age: "15-29", male: 1800, female: 1850 },
        { age: "30-44", male: 1500, female: 1550 },
      ],
      config: { xAxisKey: "age", mirror: true, series: [{ key: "male" }, { key: "female" }] },
    },
  },
  candlestick: {
    label: "Candlestick",
    family: "finance",
    description: "Financial OHLC chart. Each item needs open, high, low and close values (keys configurable via config.ohlc).",
    dataShape: "[{ <xKey>: string, open: number, high: number, low: number, close: number }]",
    example: {
      data: [
        { date: "Mon", open: 100, high: 110, low: 95, close: 108 },
        { date: "Tue", open: 108, high: 112, low: 101, close: 103 },
        { date: "Wed", open: 103, high: 115, low: 102, close: 114 },
      ],
      config: { xAxisKey: "date" },
    },
  },
  line_bar_area_composed: {
    label: "Composed",
    family: "cartesian",
    description: "Mix bars, lines and areas in one chart (set series[].type to 'bar' | 'line' | 'area'). Use series[].yAxis='right' for a secondary axis.",
    dataShape: "[{ <xKey>: string, <series>: number, ... }]",
    example: {
      data: MONTHS,
      config: {
        xAxisKey: "name",
        series: [{ key: "sales", type: "bar" }, { key: "costs", type: "area" }, { key: "margin", type: "line", yAxis: "right" }],
      },
    },
  },
  scatter_with_labels: {
    label: "Scatter",
    family: "cartesian",
    description: "Scatter plot of two numeric variables with point labels. Uses config.xAxisKey/yAxisKey or the first two numeric keys.",
    dataShape: "[{ label: string, x: number, y: number }]",
    example: {
      data: [
        { label: "A", x: 10, y: 30 },
        { label: "B", x: 40, y: 50 },
        { label: "C", x: 70, y: 20 },
      ],
      config: { xAxisKey: "x", yAxisKey: "y", labelKey: "label" },
    },
  },
  bubble: {
    label: "Bubble",
    family: "cartesian",
    description: "Scatter plot where a third numeric variable (config.zAxisKey) drives the bubble size.",
    dataShape: "[{ label: string, x: number, y: number, z: number }]",
    example: {
      data: [
        { label: "A", x: 10, y: 30, z: 200 },
        { label: "B", x: 40, y: 50, z: 800 },
        { label: "C", x: 70, y: 20, z: 400 },
      ],
      config: { xAxisKey: "x", yAxisKey: "y", zAxisKey: "z", labelKey: "label" },
    },
  },
  custom_active_pie: {
    label: "Donut",
    family: "polar",
    description: "Interactive donut chart for part-to-whole comparisons (best with < 8 slices).",
    dataShape: "[{ name: string, value: number }]",
    example: { data: SHARES },
  },
  simple_pie: {
    label: "Pie",
    family: "polar",
    description: "Classic pie chart with percentage labels.",
    dataShape: "[{ name: string, value: number }]",
    example: { data: SHARES, config: { showDataLabels: true } },
  },
  simple_radar: {
    label: "Radar",
    family: "polar",
    description: "Radar/spider chart comparing several series across multiple dimensions.",
    dataShape: "[{ <axisKey>: string, <series1>: number, <series2>: number }]",
    example: {
      data: [
        { skill: "Speed", A: 120, B: 110 },
        { skill: "Power", A: 98, B: 130 },
        { skill: "Range", A: 86, B: 130 },
        { skill: "Control", A: 99, B: 100 },
      ],
      config: { xAxisKey: "skill" },
    },
  },
  radial_bar: {
    label: "Radial bar",
    family: "polar",
    description: "Concentric radial bars, good for progress / KPI comparisons.",
    dataShape: "[{ name: string, value: number }]",
    example: { data: SHARES },
  },
  treemap: {
    label: "Treemap",
    family: "hierarchy",
    description: "Nested rectangles proportional to value. Accepts flat data or hierarchical data with `children` arrays.",
    dataShape: "[{ name: string, value: number }] or [{ name: string, children: [{ name, value }] }]",
    example: {
      data: [
        { name: "Africa", children: [{ name: "Senegal", value: 18 }, { name: "Nigeria", value: 220 }] },
        { name: "Europe", children: [{ name: "France", value: 68 }, { name: "Germany", value: 84 }] },
      ],
    },
  },
  funnel: {
    label: "Funnel",
    family: "hierarchy",
    description: "Funnel chart for sequential conversion stages (sorted descending automatically).",
    dataShape: "[{ name: string, value: number }]",
    example: {
      data: [
        { name: "Visits", value: 5000 },
        { name: "Sign-ups", value: 1200 },
        { name: "Trials", value: 600 },
        { name: "Paid", value: 180 },
      ],
    },
  },
};

export const DEFAULT_PALETTE = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#14b8a6"];

export const PALETTES: Record<string, string[]> = {
  default: DEFAULT_PALETTE,
  ocean: ["#0ea5e9", "#06b6d4", "#14b8a6", "#3b82f6", "#6366f1", "#0284c7", "#0891b2", "#0f766e"],
  sunset: ["#f97316", "#f43f5e", "#ec4899", "#eab308", "#ef4444", "#d946ef", "#fb923c", "#facc15"],
  forest: ["#22c55e", "#16a34a", "#84cc16", "#65a30d", "#15803d", "#4d7c0f", "#a3e635", "#166534"],
  mono: ["#18181b", "#3f3f46", "#52525b", "#71717a", "#a1a1aa", "#d4d4d8"],
  pastel: ["#a5b4fc", "#c4b5fd", "#f9a8d4", "#fda4af", "#fdba74", "#fde047", "#86efac", "#67e8f9"],
  vivid: ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#db2777", "#65a30d"],
};
