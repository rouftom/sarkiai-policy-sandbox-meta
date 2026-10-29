/**
 * Single source of truth for how a dataset maps onto each chart type.
 * Used by the server (validation, alternatives) and by the UI (renderer, type picker)
 * so that switching chart type never changes which field means what.
 * Keep free of Node/DOM imports: bundled in both.
 */
import { CHART_TYPES, type ChartType } from "./chart-catalog.js";

export type Row = Record<string, any>;

export interface KeySeries {
  key: string;
  name?: string;
  color?: string;
  type?: string;
  stackId?: string;
  yAxis?: "left" | "right";
  dashed?: boolean;
}

export interface CompatConfig {
  xAxisKey?: string;
  yAxisKey?: string;
  zAxisKey?: string;
  labelKey?: string;
  nameKey?: string;
  valueKey?: string;
  ohlc?: Partial<Record<"open" | "high" | "low" | "close", string>>;
  series?: KeySeries[];
}

export interface ResolvedKeys {
  ok: boolean;
  /** Why the type cannot display this data (only when ok is false). */
  reason?: string;
  xKey: string;
  series: KeySeries[];
  nameKey: string;
  valueKey: string;
  x?: string;
  y?: string;
  z?: string;
  label?: string;
  ohlc: { open: string; high: string; low: string; close: string };
}

const SAMPLE = 50;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function numericKeysOf(data: Row[]): string[] {
  const keys = new Set<string>();
  for (const row of data.slice(0, SAMPLE)) for (const [k, v] of Object.entries(row ?? {})) if (isNum(v)) keys.add(k);
  return [...keys];
}

export function stringKeysOf(data: Row[]): string[] {
  const keys = new Set<string>();
  for (const row of data.slice(0, SAMPLE)) for (const [k, v] of Object.entries(row ?? {})) if (typeof v === "string") keys.add(k);
  return [...keys];
}

const pick = (preferred: string | undefined, available: string[]): string | undefined =>
  preferred && available.includes(preferred) ? preferred : undefined;

/** Maps data and config onto the fields a given chart type needs. */
export function resolveKeys(type: ChartType | string, data: Row[], config: CompatConfig = {}): ResolvedKeys {
  const nums = numericKeysOf(data);
  const strs = stringKeysOf(data);
  const allKeys = Object.keys(data[0] ?? {});
  const xKey = pick(config.xAxisKey, [...strs, ...nums, ...allKeys]) ?? strs[0] ?? allKeys[0] ?? "name";

  const numericCandidates = nums.filter((k) => k !== xKey);
  const configuredSeries = (config.series ?? []).filter((s) => nums.includes(s.key) && s.key !== xKey);
  const series: KeySeries[] = configuredSeries.length ? configuredSeries : numericCandidates.map((key) => ({ key }));

  const nameKey = pick(config.nameKey, [...strs, ...allKeys]) ?? (allKeys.includes("name") ? "name" : strs[0] ?? xKey);
  const valueKey = pick(config.valueKey, nums) ?? series[0]?.key ?? (nums.includes("value") ? "value" : nums[0]) ?? "value";

  const x = pick(config.xAxisKey, nums) ?? (nums.includes("x") ? "x" : numericCandidates[0]);
  const y = pick(config.yAxisKey, nums) ?? (nums.includes("y") && "y" !== x ? "y" : numericCandidates.find((k) => k !== x));
  const z = pick(config.zAxisKey, nums) ?? (nums.includes("z") && "z" !== x && "z" !== y ? "z" : numericCandidates.find((k) => k !== x && k !== y));
  const label = pick(config.labelKey, [...strs, ...allKeys]) ?? strs[0];

  const ohlc = {
    open: config.ohlc?.open ?? "open",
    high: config.ohlc?.high ?? "high",
    low: config.ohlc?.low ?? "low",
    close: config.ohlc?.close ?? "close",
  };

  const base: ResolvedKeys = { ok: true, xKey, series, nameKey, valueKey, x, y, z, label, ohlc };
  const fail = (reason: string): ResolvedKeys => ({ ...base, ok: false, reason });

  if (data.length === 0) return fail("Aucune donnée.");

  switch (type) {
    case "candlestick": {
      const missing = Object.values(ohlc).filter((k) => !nums.includes(k));
      return missing.length ? fail(`Requiert des valeurs numériques ${Object.values(ohlc).join(", ")} (manquantes : ${missing.join(", ")}).`) : base;
    }
    case "scatter_with_labels":
      return nums.length >= 2 && x && y ? base : fail("Requiert au moins deux variables numériques (x et y).");
    case "bubble":
      return nums.length >= 3 && x && y && z ? base : fail("Requiert trois variables numériques (x, y, taille).");
    case "simple_radar":
      return series.length >= 2 ? base : fail("Requiert au moins deux séries numériques pour comparer des axes.");
    case "funnel":
      return data.length >= 2 && nums.length >= 1 ? base : fail("Requiert au moins deux étapes avec une valeur numérique.");
    case "treemap":
      return data.some((r) => Array.isArray(r?.children)) || nums.length >= 1 ? base : fail("Requiert une valeur numérique (ou des enfants).");
    case "custom_active_pie":
    case "simple_pie":
    case "radial_bar":
      return nums.length >= 1 ? base : fail("Requiert une valeur numérique par ligne.");
    default:
      // Cartesian charts (line, area, bar, composed, pyramid, stacked...)
      return series.length >= 1 ? base : fail("Requiert au moins une colonne numérique.");
  }
}

/** Chart types able to display this dataset, in catalog order. */
export function compatibleTypes(data: Row[], config: CompatConfig = {}): ChartType[] {
  return CHART_TYPES.filter((t) => resolveKeys(t, data, config).ok);
}
