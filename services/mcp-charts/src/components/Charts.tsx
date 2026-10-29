import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Sector,
  ScatterChart, Scatter, ZAxis, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar, Treemap, FunnelChart, Funnel,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, LabelList, ReferenceLine,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import {
  BarChart3, ClipboardCopy, Download, FileImage, Grid3x3, Maximize2, Minimize2, Sparkles, Tag, List, Check,
} from 'lucide-react';
import { CHART_CATALOG, CHART_TYPES, DEFAULT_PALETTE, PALETTES } from '../chart-catalog';
import { compatibleTypes, resolveKeys } from '../chart-compat';
import { useMcpApp } from '../app-context';
import { copyText, downloadBlob, fileName, serializeChartSvg, svgToPngBlob, toCSV } from '../utils/export';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeriesConfig { key: string; color?: string; name?: string; type?: string; stackId?: string; yAxis?: 'left' | 'right'; dashed?: boolean }

export interface ChartConfig {
  title?: string;
  subtitle?: string;
  xAxisKey?: string;
  yAxisKey?: string;
  zAxisKey?: string;
  labelKey?: string;
  nameKey?: string;
  valueKey?: string;
  ohlc?: Partial<Record<'open' | 'high' | 'low' | 'close', string>>;
  locale?: string;
  series?: SeriesConfig[];
  palette?: string;
  colors?: string[];
  stacked?: boolean;
  mirror?: boolean;
  curve?: 'monotone' | 'linear' | 'step' | 'natural';
  showLegend?: boolean;
  showGrid?: boolean;
  showDataLabels?: boolean;
  showDots?: boolean;
  animate?: boolean;
  valueFormat?: 'number' | 'compact' | 'percent' | 'currency';
  currency?: string;
  decimals?: number;
  unit?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  yAxisDomain?: [number | 'auto', number | 'auto'];
  referenceLines?: Array<{ axis?: 'x' | 'y'; value: number | string; label?: string; color?: string }>;
  height?: number;
}

export interface ChartInput { type: string; data: any[]; config?: ChartConfig; stats?: any[]; warnings?: string[] }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function makeFormatter(config: ChartConfig, locale: string, data: any[], keys: string[]) {
  const { valueFormat = 'number', currency = 'USD', decimals, unit } = config;
  // Percent: values within [-1, 1] are ratios, otherwise already percentages
  let ratio = true;
  if (valueFormat === 'percent') {
    outer: for (const row of data) for (const k of keys) if (typeof row?.[k] === 'number' && Math.abs(row[k]) > 1) { ratio = false; break outer; }
  }
  let nf: Intl.NumberFormat;
  try {
    switch (valueFormat) {
      case 'compact': nf = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: decimals ?? 1 }); break;
      case 'percent': nf = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: decimals ?? 1 }); break;
      case 'currency': nf = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: decimals ?? 2 }); break;
      default: nf = new Intl.NumberFormat(locale, { maximumFractionDigits: decimals ?? 2 });
    }
  } catch {
    nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals ?? 2 });
  }
  return (v: unknown): string => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return Array.isArray(v) ? v.join(' – ') : String(v ?? '');
    const s = nf.format(valueFormat === 'percent' && !ratio ? v / 100 : v);
    return unit ? `${s} ${unit}` : s;
  };
}

/** Normalizes rows into { name, value } items for polar / hierarchy charts. */
function toNameValue(data: any[], keys: { nameKey: string; valueKey: string }, fallbackName: string) {
  const { nameKey, valueKey } = keys;
  const map = (d: any, i: number): any => ({
    ...d,
    name: d?.[nameKey] ?? `${fallbackName} ${i + 1}`,
    value: typeof d?.[valueKey] === 'number' ? d[valueKey] : undefined,
    ...(Array.isArray(d?.children) ? { children: d.children.map(map) } : {}),
  });
  return data.map(map);
}

const CustomTooltip = ({ active, payload, label, formatter }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      {label !== undefined && label !== '' && <p className="text-[10px] font-medium tracking-wide opacity-60 mb-2" style={{ color: 'var(--text-primary)' }}>{String(label)}</p>}
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-3 py-0.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.payload?.fill || entry.fill }} />
          <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{entry.name ?? entry.payload?.name}:</span>
          <span className="text-xs font-medium ml-auto tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatter(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

const CandlestickShape = (props: any) => {
  const { x, y, width, height, payload, ohlc, up, down } = props;
  const open = payload[ohlc.open], close = payload[ohlc.close], high = payload[ohlc.high], low = payload[ohlc.low];
  if ([open, close, high, low].some((v) => typeof v !== 'number')) return null;
  const isUp = close >= open;
  const color = isUp ? up : down;
  const range = high - low || 1;
  const ratio = height / range;
  const bodyTop = y + (high - Math.max(open, close)) * ratio;
  const bodyHeight = Math.max(1, Math.abs(open - close) * ratio);
  const cx = x + width / 2;
  const bodyW = Math.max(2, width * 0.6);
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1.5} />
      <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyHeight} fill={color} rx={1.5} />
    </g>
  );
};

const renderActivePieShape = (formatter: (v: unknown) => string) => (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--text-primary)" fontSize={12} fontWeight={700}>{payload.name}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="var(--text-secondary)" fontSize={11}>{formatter(value)}</text>
      <text x={cx} y={cy + 22} textAnchor="middle" fill="var(--text-secondary)" fontSize={10}>{`${(percent * 100).toFixed(1)}%`}</text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 9} outerRadius={outerRadius + 12} startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  );
};

const TreemapCell = (props: any) => {
  const { x, y, width, height, name, depth, index, root, colors, children } = props;
  if (depth === 0 || width <= 0 || height <= 0) return null;
  const colorIndex = depth === 1 ? index : (root?.index ?? index);
  const fill = colors[colorIndex % colors.length];
  const isLeaf = !children || children.length === 0;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={depth === 1 ? 0.9 : 0.75} stroke="var(--treemap-stroke)" strokeWidth={depth === 1 ? 2 : 1} rx={4} />
      {isLeaf && width > 44 && height > 20 && (
        <text x={x + 6} y={y + 16} fill="#fff" fontSize={11} fontWeight={600}>{String(name).slice(0, Math.floor(width / 7))}</text>
      )}
    </g>
  );
};

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

interface DisplayOptions { showLegend: boolean; showGrid: boolean; showDataLabels: boolean }

const ChartRenderer: React.FC<{ type: string; data: any[]; config: ChartConfig; display: DisplayOptions; locale: string }> = ({ type, data, config, display, locale }) => {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);

  const colors = config.colors?.length ? config.colors : PALETTES[config.palette || 'default'] ?? DEFAULT_PALETTE;
  const keys = useMemo(() => resolveKeys(type, data, config), [type, data, config]);
  const xAxisKey = keys.xKey;
  const series: SeriesConfig[] = keys.series.map((s, i) => ({ ...s, color: s.color || colors[i % colors.length], name: s.name || s.key }));
  if (series.length === 0) series.push({ key: keys.valueKey, color: colors[0], name: t('default_value_name') });

  const formatter = useMemo(() => makeFormatter(config, locale, data, series.map((s) => s.key)), [config, locale, data, series.map((s) => s.key).join('|')]);
  const animate = config.animate !== false;
  const curve = config.curve || 'monotone';
  const hasRight = series.some((s) => s.yAxis === 'right');
  const margin = { top: 12, right: hasRight ? 8 : 16, left: 4, bottom: config.xAxisLabel ? 16 : 4 };
  const tick = { fontSize: 10 };
  const domain = config.yAxisDomain ? (config.yAxisDomain.map((d) => (d === 'auto' ? 'auto' : d)) as any) : undefined;
  const yTickFmt = (v: any) => (typeof v === 'number' ? makeFormatter({ ...config, valueFormat: config.valueFormat === 'currency' ? 'compact' : config.valueFormat ?? 'compact', unit: undefined }, locale, data, series.map((s) => s.key))(v) : v);
  const tooltip = <Tooltip content={<CustomTooltip formatter={formatter} />} cursor={{ fill: 'var(--cursor-fill)' }} />;
  const legend = display.showLegend ? <Legend wrapperStyle={{ fontSize: '10px' }} /> : null;
  const grid = display.showGrid ? <CartesianGrid strokeDasharray="3 3" vertical={false} /> : null;
  const xLabel = config.xAxisLabel ? { value: config.xAxisLabel, position: 'insideBottom' as const, offset: -8, fontSize: 10 } : undefined;
  const yLabel = config.yAxisLabel ? { value: config.yAxisLabel, angle: -90, position: 'insideLeft' as const, fontSize: 10 } : undefined;

  const xAxis = <XAxis dataKey={xAxisKey} tick={tick} padding={type === 'line_chart_padding' ? { left: 10, right: 10 } : undefined} label={xLabel} />;
  // Recharts 2 does not traverse fragments: axes must be passed as an array
  const yAxes = [
    <YAxis key="y-left" yAxisId="left" tick={tick} tickFormatter={yTickFmt} domain={domain} label={yLabel} width={56} />,
    hasRight ? <YAxis key="y-right" yAxisId="right" orientation="right" tick={tick} tickFormatter={yTickFmt} width={56} /> : null,
  ];
  const axisId = (s: SeriesConfig) => (s.yAxis === 'right' && hasRight ? 'right' : 'left');
  const refLines = (config.referenceLines ?? []).map((r, i) =>
    (r.axis ?? 'y') === 'y'
      ? <ReferenceLine key={`ref-${i}`} yAxisId="left" y={r.value as any} stroke={r.color || '#f43f5e'} strokeDasharray="4 4" label={r.label ? { value: r.label, fontSize: 10, fill: r.color || '#f43f5e', position: 'insideTopRight' } : undefined} />
      : <ReferenceLine key={`ref-${i}`} yAxisId="left" x={r.value as any} stroke={r.color || '#f43f5e'} strokeDasharray="4 4" label={r.label ? { value: r.label, fontSize: 10, fill: r.color || '#f43f5e', position: 'insideTopLeft' } : undefined} />
  );
  const labels = (key: string, position: any = 'top') => display.showDataLabels ? <LabelList dataKey={key} position={position} formatter={formatter} style={{ fontSize: 9, fill: 'var(--text-secondary)' }} /> : null;
  const stackFor = (s: SeriesConfig) => s.stackId ?? (config.stacked ? 'stack' : undefined);

  const wrap = (chart: React.ReactElement) => <ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer>;

  if (!keys.ok) {
    return <div className="flex items-center justify-center h-full p-6 text-center text-amber-500 text-xs font-semibold">{keys.reason}</div>;
  }

  switch (type) {
    case 'line_chart_padding':
      return wrap(
        <LineChart data={data} margin={margin}>
          {grid}{xAxis}{yAxes}{tooltip}{legend}{refLines}
          {series.map((s) => (
            <Line key={s.key} yAxisId={axisId(s)} type={curve} dataKey={s.key} stroke={s.color} strokeWidth={2.5} strokeDasharray={s.dashed ? '6 4' : undefined}
              dot={config.showDots === false ? false : { r: 3 }} activeDot={{ r: 5 }} name={s.name} isAnimationActive={animate}>
              {labels(s.key)}
            </Line>
          ))}
        </LineChart>
      );

    case 'simple_area':
    case 'stacked_area':
      return wrap(
        <AreaChart data={data} margin={margin}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={`grad-${i}`} id={`grad-${type}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={type === 'stacked_area' ? 0.6 : 0.35} />
                <stop offset="95%" stopColor={s.color} stopOpacity={type === 'stacked_area' ? 0.15 : 0} />
              </linearGradient>
            ))}
          </defs>
          {grid}{xAxis}{yAxes}{tooltip}{legend}{refLines}
          {series.map((s, i) => (
            <Area key={s.key} yAxisId={axisId(s)} type={curve} dataKey={s.key} stroke={s.color} strokeWidth={2} fillOpacity={1} fill={`url(#grad-${type}-${i})`}
              stackId={type === 'stacked_area' ? (s.stackId ?? 'stack') : stackFor(s)} name={s.name} isAnimationActive={animate}>
              {labels(s.key)}
            </Area>
          ))}
        </AreaChart>
      );

    case 'simple_bar':
    case 'ranged_stacked_bar':
      return wrap(
        <BarChart data={data} margin={margin}>
          {grid}{xAxis}{yAxes}{tooltip}{legend}{refLines}
          {series.map((s, i) => {
            const stacked = type === 'ranged_stacked_bar' ? (s.stackId ?? 'stack') : stackFor(s);
            const isTop = !stacked || i === series.length - 1;
            return (
              <Bar key={s.key} yAxisId={axisId(s)} dataKey={s.key} fill={s.color} stackId={stacked} name={s.name} isAnimationActive={animate}
                radius={isTop ? [6, 6, 0, 0] : [0, 0, 0, 0]} maxBarSize={64}
                activeBar={{ fillOpacity: 0.85, stroke: s.color, strokeWidth: 1 }}>
                {labels(s.key, stacked ? 'center' : 'top')}
              </Bar>
            );
          })}
        </BarChart>
      );

    case 'custom_shape_bar': {
      const s = series[0];
      return wrap(
        <BarChart data={data} margin={margin}>
          {grid}{xAxis}{yAxes}{tooltip}{refLines}
          <Bar yAxisId="left" dataKey={s.key} name={s.name} radius={[999, 999, 999, 999]} maxBarSize={36} isAnimationActive={animate}>
            {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            {labels(s.key)}
          </Bar>
        </BarChart>
      );
    }

    case 'horizontal_bar':
      return wrap(
        <BarChart data={data} margin={{ ...margin, left: 8 }} layout="vertical">
          {display.showGrid && <CartesianGrid strokeDasharray="3 3" horizontal={false} />}
          <XAxis type="number" tick={tick} tickFormatter={yTickFmt} domain={domain} />
          <YAxis type="category" dataKey={xAxisKey} tick={tick} width={Math.min(140, 12 + 6 * Math.max(...data.map((d) => String(d?.[xAxisKey] ?? '').length), 4))} />
          {tooltip}{legend}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color} name={s.name} stackId={stackFor(s)} isAnimationActive={animate} maxBarSize={28}
              radius={!stackFor(s) || i === series.length - 1 ? [0, 6, 6, 0] : [0, 0, 0, 0]}>
              {labels(s.key, 'right')}
            </Bar>
          ))}
        </BarChart>
      );

    case 'population_pyramid': {
      const pyramidData = config.mirror && series[0]
        ? data.map((d) => ({ ...d, [series[0].key]: -Math.abs(Number(d[series[0].key]) || 0) }))
        : data;
      const absFmt = (v: unknown) => formatter(typeof v === 'number' ? Math.abs(v) : v);
      return wrap(
        <BarChart data={pyramidData} margin={margin} layout="vertical" stackOffset="sign" barCategoryGap={2}>
          {display.showGrid && <CartesianGrid strokeDasharray="3 3" horizontal={false} />}
          <XAxis type="number" tick={tick} tickFormatter={(v) => yTickFmt(Math.abs(v))} />
          <YAxis dataKey={xAxisKey} type="category" tick={tick} width={56} />
          <Tooltip content={<CustomTooltip formatter={absFmt} />} cursor={{ fill: 'var(--cursor-fill)' }} />
          {legend}
          <ReferenceLine x={0} stroke="var(--text-secondary)" strokeOpacity={0.4} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} name={s.name} isAnimationActive={animate}>
              {display.showDataLabels && <LabelList dataKey={s.key} position="inside" formatter={absFmt} style={{ fontSize: 9, fill: '#fff' }} />}
            </Bar>
          ))}
        </BarChart>
      );
    }

    case 'candlestick': {
      const ohlc = keys.ohlc;
      const candleData = data.map((d) => ({ ...d, __range: [d[ohlc.low], d[ohlc.high]] }));
      const CandleTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null;
        const p = payload[0].payload;
        return (
          <div className="custom-tooltip">
            <p className="text-[10px] font-medium opacity-60 mb-1">{label}</p>
            {(['open', 'high', 'low', 'close'] as const).map((k) => (
              <div key={k} className="flex gap-4 text-xs"><span className="font-bold capitalize">{t(`ohlc_${k}`)}</span><span className="ml-auto tabular-nums">{formatter(p[ohlc[k]])}</span></div>
            ))}
          </div>
        );
      };
      return wrap(
        <ComposedChart data={candleData} margin={margin}>
          {grid}{xAxis}
          <YAxis yAxisId="left" tick={tick} tickFormatter={yTickFmt} domain={domain ?? ['auto', 'auto']} width={56} />
          <Tooltip content={<CandleTooltip />} cursor={{ fill: 'var(--cursor-fill)' }} />
          {refLines}
          <Bar yAxisId="left" dataKey="__range" name={config.title || 'OHLC'} isAnimationActive={animate}
            shape={(p: any) => <CandlestickShape {...p} ohlc={ohlc} up={colors === DEFAULT_PALETTE ? '#22c55e' : colors[0]} down={colors === DEFAULT_PALETTE ? '#ef4444' : colors[1] ?? '#ef4444'} />} />
        </ComposedChart>
      );
    }

    case 'line_bar_area_composed':
      return wrap(
        <ComposedChart data={data} margin={margin}>
          {grid}{xAxis}{yAxes}{tooltip}{legend}{refLines}
          {series.map((s, i) => {
            const kind = s.type || (i === 0 ? 'bar' : 'line');
            if (kind === 'bar') return <Bar key={s.key} yAxisId={axisId(s)} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} name={s.name} stackId={stackFor(s)} maxBarSize={48} isAnimationActive={animate}>{labels(s.key)}</Bar>;
            if (kind === 'area') return <Area key={s.key} yAxisId={axisId(s)} type={curve} dataKey={s.key} fill={s.color} stroke={s.color} fillOpacity={0.2} name={s.name} isAnimationActive={animate} />;
            return <Line key={s.key} yAxisId={axisId(s)} type={curve} dataKey={s.key} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '6 4' : undefined} dot={config.showDots === false ? false : { r: 3 }} name={s.name} isAnimationActive={animate}>{labels(s.key)}</Line>;
          })}
        </ComposedChart>
      );

    case 'scatter_with_labels':
    case 'bubble': {
      const xKey = keys.x ?? keys.valueKey;
      const yKey = keys.y ?? keys.valueKey;
      const zKey = keys.z;
      const labelKey = keys.label;
      return wrap(
        <ScatterChart margin={{ ...margin, top: 20 }}>
          {display.showGrid && <CartesianGrid strokeDasharray="3 3" />}
          <XAxis type="number" dataKey={xKey} name={config.xAxisLabel || xKey} tick={tick} tickFormatter={yTickFmt} label={xLabel} />
          <YAxis yAxisId="left" type="number" dataKey={yKey} name={config.yAxisLabel || yKey} tick={tick} tickFormatter={yTickFmt} domain={domain} label={yLabel} width={56} />
          {type === 'bubble' && zKey && <ZAxis type="number" dataKey={zKey} range={[60, 1200]} name={zKey} />}
          <Tooltip content={<CustomTooltip formatter={formatter} />} cursor={{ strokeDasharray: '3 3' }} />
          {refLines}
          <Scatter yAxisId="left" name={series[0]?.name || t('default_data_name')} data={data} fill={colors[0]} fillOpacity={type === 'bubble' ? 0.65 : 1} isAnimationActive={animate}>
            {data.map((_, i) => <Cell key={i} fill={type === 'bubble' ? colors[i % colors.length] : colors[0]} />)}
            {labelKey && (display.showDataLabels || data.length <= 30) && <LabelList dataKey={labelKey} position="top" style={{ fontSize: 10, fill: 'var(--text-secondary)' }} />}
          </Scatter>
        </ScatterChart>
      );
    }

    case 'custom_active_pie':
    case 'simple_pie': {
      const pieData = toNameValue(data, keys, t('default_data_name'));
      const donut = type === 'custom_active_pie';
      return wrap(
        <PieChart margin={margin}>
          <Pie
            data={pieData}
            cx="50%" cy="50%"
            innerRadius={donut ? '55%' : 0}
            outerRadius={donut ? '75%' : '80%'}
            paddingAngle={donut ? 3 : 0}
            dataKey="value"
            nameKey="name"
            isAnimationActive={animate}
            {...(donut ? { activeIndex, activeShape: renderActivePieShape(formatter), onMouseEnter: (_: any, i: number) => setActiveIndex(i) } : {})}
            label={!donut && (display.showDataLabels ?? true) ? ({ percent }: any) => `${(percent * 100).toFixed(0)}%` : undefined}
            labelLine={!donut}
          >
            {pieData.map((d, i) => <Cell key={`cell-${i}`} fill={d.color || colors[i % colors.length]} stroke="var(--slice-stroke)" />)}
          </Pie>
          <Tooltip content={<CustomTooltip formatter={formatter} />} />
          {legend}
        </PieChart>
      );
    }

    case 'simple_radar':
      return wrap(
        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data} margin={margin}>
          <PolarGrid stroke="var(--grid-line-strong)" />
          <PolarAngleAxis dataKey={xAxisKey} tick={tick} />
          <PolarRadiusAxis tick={{ fontSize: 9 }} tickFormatter={yTickFmt} domain={domain} />
          {series.map((s) => (
            <Radar key={s.key} name={s.name} dataKey={s.key} stroke={s.color} fill={s.color} fillOpacity={0.35} isAnimationActive={animate} />
          ))}
          <Tooltip content={<CustomTooltip formatter={formatter} />} />
          {legend}
        </RadarChart>
      );

    case 'radial_bar': {
      const radialData = toNameValue(data, keys, t('default_data_name')).map((d, i) => ({ ...d, fill: d.color || colors[i % colors.length] }));
      return wrap(
        <RadialBarChart cx="50%" cy="50%" innerRadius="18%" outerRadius="95%" barSize={14} data={radialData} startAngle={90} endAngle={-270}>
          <RadialBar background={{ fill: 'var(--glass-bg)' }} dataKey="value" cornerRadius={8} isAnimationActive={animate}
            label={display.showDataLabels ? { position: 'insideStart', fill: '#fff', fontSize: 9, formatter } : undefined} />
          <Tooltip content={<CustomTooltip formatter={formatter} />} />
          {display.showLegend && <Legend iconSize={8} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '10px' }} />}
        </RadialBarChart>
      );
    }

    case 'treemap': {
      const treeData = toNameValue(data, keys, t('default_data_name'));
      return wrap(
        <Treemap data={treeData} dataKey="value" nameKey="name" aspectRatio={4 / 3} isAnimationActive={animate}
          content={<TreemapCell colors={colors} />}>
          <Tooltip content={<CustomTooltip formatter={formatter} />} />
        </Treemap>
      );
    }

    case 'funnel': {
      const funnelData = toNameValue(data, keys, t('default_data_name'))
        .filter((d) => typeof d.value === 'number')
        .sort((a, b) => b.value - a.value)
        .map((d, i) => ({ ...d, fill: d.color || colors[i % colors.length] }));
      return wrap(
        <FunnelChart margin={{ ...margin, right: 90 }}>
          <Tooltip content={<CustomTooltip formatter={formatter} />} />
          <Funnel dataKey="value" nameKey="name" data={funnelData} isAnimationActive={animate}>
            <LabelList position="right" dataKey="name" stroke="none" style={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
            {display.showDataLabels !== false && <LabelList position="center" dataKey="value" formatter={formatter} stroke="none" style={{ fontSize: 10, fill: '#fff', fontWeight: 600 }} />}
          </Funnel>
        </FunnelChart>
      );
    }

    default:
      return <div className="flex items-center justify-center h-full text-zinc-500 font-semibold tracking-wide text-xs">{t('unsupported_chart')}</div>;
  }
};

// ---------------------------------------------------------------------------
// Chart card (toolbar + renderer)
// ---------------------------------------------------------------------------

const IconButton: React.FC<{ title: string; onClick: () => void; active?: boolean; children: React.ReactNode }> = ({ title, onClick, active, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    aria-pressed={active}
    onClick={onClick}
    className={`chart-icon-btn ${active ? 'is-active' : ''}`}
  >
    {children}
  </button>
);

export const ChartCard: React.FC<{ chart: ChartInput; compact?: boolean }> = ({ chart, compact = false }) => {
  const { t, i18n } = useTranslation();
  const { app, theme, displayMode, canFullscreen, toggleFullscreen } = useMcpApp();
  const config = chart.config || {};
  const [currentType, setCurrentType] = useState<string>(chart.type);
  const [display, setDisplay] = useState<DisplayOptions>({
    showLegend: config.showLegend ?? !compact,
    showGrid: config.showGrid ?? true,
    showDataLabels: config.showDataLabels ?? false,
  });
  const [flash, setFlash] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCurrentType(chart.type); }, [chart.type]);
  useEffect(() => {
    setDisplay({ showLegend: config.showLegend ?? !compact, showGrid: config.showGrid ?? true, showDataLabels: config.showDataLabels ?? false });
  }, [config.showLegend, config.showGrid, config.showDataLabels, compact]);

  const locale = config.locale || i18n.language || 'en';
  const data = Array.isArray(chart.data) ? chart.data : [];
  const notify = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 1600); };
  const background = theme === 'dark' ? '#0f0f12' : '#ffffff';

  const exportImage = async (format: 'png' | 'svg') => {
    if (!chartRef.current) return;
    const result = serializeChartSvg(chartRef.current, background);
    if (!result) return notify(t('export_failed'));
    const blob = format === 'svg'
      ? new Blob([result.svg], { type: 'image/svg+xml' })
      : await svgToPngBlob(result.svg, result.width, result.height);
    if (!blob) return notify(t('export_failed'));
    notify((await downloadBlob(app, blob, fileName(config.title, format))) ? t('exported') : t('export_failed'));
  };

  const exportCsv = async (mode: 'copy' | 'download') => {
    const csv = toCSV(data);
    if (mode === 'copy') return notify((await copyText(csv)) ? t('copied') : t('export_failed'));
    notify((await downloadBlob(app, new Blob([csv], { type: 'text/csv' }), fileName(config.title, 'csv'))) ? t('exported') : t('export_failed'));
  };

  const askInsights = async () => {
    if (!app) return;
    const sample = JSON.stringify(data.slice(0, 60));
    try {
      await app.sendMessage({
        role: 'user',
        content: [{ type: 'text', text: t('insights_prompt', { title: config.title || CHART_CATALOG[currentType as keyof typeof CHART_CATALOG]?.label || currentType, data: sample }) }],
      });
      notify(t('sent'));
    } catch {
      notify(t('export_failed'));
    }
  };

  const canMessage = Boolean(app?.getHostCapabilities()?.message);
  const height = config.height ?? (compact ? 280 : undefined);

  return (
    <div className={`flex flex-col gap-2 w-full animate-in`}>
      <header className="flex flex-row items-start justify-between gap-2 px-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="text-xs font-bold tracking-tight opacity-90 truncate">{config.title || CHART_CATALOG[currentType as keyof typeof CHART_CATALOG]?.label || t('loading_chart')}</h2>
          {config.subtitle && <p className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>{config.subtitle}</p>}
          <div className="h-0.5 w-8 bg-indigo-500/50 mt-0.5" />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {flash && <span className="text-[10px] font-semibold text-emerald-500 flex items-center gap-1 mr-1"><Check size={10} />{flash}</span>}
          <label className="sr-only" htmlFor={`type-${config.title ?? ''}`}>{t('chart_type')}</label>
          <div className="relative flex items-center">
            <BarChart3 size={11} className="absolute left-1.5 pointer-events-none opacity-60" />
            <select
              id={`type-${config.title ?? ''}`}
              value={currentType}
              onChange={(e) => setCurrentType(e.target.value)}
              className="chart-select"
            >
              {CHART_TYPES.map((value) => {
                const check = resolveKeys(value, data, config);
                return (
                  <option key={value} value={value} disabled={!check.ok} title={check.reason}>
                    {CHART_CATALOG[value].label}{check.ok ? '' : ' ⊘'}
                  </option>
                );
              })}
            </select>
          </div>
          <IconButton title={t('toggle_legend')} active={display.showLegend} onClick={() => setDisplay((d) => ({ ...d, showLegend: !d.showLegend }))}><List size={12} /></IconButton>
          <IconButton title={t('toggle_grid')} active={display.showGrid} onClick={() => setDisplay((d) => ({ ...d, showGrid: !d.showGrid }))}><Grid3x3 size={12} /></IconButton>
          <IconButton title={t('toggle_labels')} active={display.showDataLabels} onClick={() => setDisplay((d) => ({ ...d, showDataLabels: !d.showDataLabels }))}><Tag size={12} /></IconButton>
          <IconButton title={t('export_png')} onClick={() => exportImage('png')}><FileImage size={12} /></IconButton>
          <IconButton title={t('export_svg')} onClick={() => exportImage('svg')}><Download size={12} /></IconButton>
          <IconButton title={t('copy_csv')} onClick={() => exportCsv('copy')}><ClipboardCopy size={12} /></IconButton>
          {canMessage && <IconButton title={t('insights')} onClick={askInsights}><Sparkles size={12} /></IconButton>}
          {!compact && canFullscreen && (
            <IconButton title={displayMode === 'fullscreen' ? t('exit_fullscreen') : t('fullscreen')} onClick={toggleFullscreen}>
              {displayMode === 'fullscreen' ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </IconButton>
          )}
        </div>
      </header>

      <main
        ref={chartRef}
        className={`rounded-xl p-1 relative overflow-hidden ${height ? '' : 'h-[380px]'}`}
        style={height ? { height } : undefined}
      >
        {data.length === 0
          ? <div className="flex items-center justify-center h-full text-zinc-500 text-xs">{t('no_data')}</div>
          : <ChartRenderer type={currentType} data={data} config={config} display={display} locale={locale} />}
      </main>

      {!resolveKeys(currentType, data, config).ok && (
        <p className="px-2 text-[10px] text-amber-500 flex flex-wrap items-center gap-2">
          <span>{resolveKeys(currentType, data, config).reason}</span>
          {compatibleTypes(data, config).slice(0, 3).map((ct) => (
            <button key={ct} type="button" onClick={() => setCurrentType(ct)} className="underline underline-offset-2 font-bold">
              {CHART_CATALOG[ct].label}
            </button>
          ))}
        </p>
      )}

      {!!chart.warnings?.length && !compact && (
        <p className="px-2 text-[10px] text-amber-500/90 truncate" title={chart.warnings.join('\n')}>⚠ {chart.warnings[0]}</p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardInput {
  mode: 'dashboard';
  title?: string;
  subtitle?: string;
  columns?: number;
  kpis?: Array<{ label: string; value: number | string; delta?: number; unit?: string }>;
  charts: ChartInput[];
}

export const Dashboard: React.FC<{ input: DashboardInput }> = ({ input }) => {
  const { i18n } = useTranslation();
  const cols = Math.min(4, Math.max(1, input.columns ?? 2));
  const nf = new Intl.NumberFormat(i18n.language || 'en', { maximumFractionDigits: 2 });
  return (
    <div className="w-full p-2 flex flex-col gap-3 animate-in">
      {(input.title || input.subtitle) && (
        <header className="px-2">
          {input.title && <h1 className="text-sm font-black tracking-tight">{input.title}</h1>}
          {input.subtitle && <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{input.subtitle}</p>}
        </header>
      )}
      {!!input.kpis?.length && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(130px, 1fr))` }}>
          {input.kpis.map((k, i) => (
            <div key={i} className="glass-effect rounded-xl px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{k.label}</p>
              <p className="text-lg font-black tabular-nums leading-tight">{typeof k.value === 'number' ? nf.format(k.value) : k.value}{k.unit ? <span className="text-xs font-semibold ml-1 opacity-70">{k.unit}</span> : null}</p>
              {typeof k.delta === 'number' && (
                <p className={`text-[10px] font-bold ${k.delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{k.delta >= 0 ? '▲' : '▼'} {Math.abs(k.delta).toFixed(1)}%</p>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="dashboard-grid grid gap-3" style={{ ['--cols' as any]: cols }}>
        {input.charts.map((chart, i) => (
          <div key={i} className="glass-effect rounded-xl p-2">
            <ChartCard chart={chart} compact />
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export const Charts: React.FC<{ chartInput: any }> = ({ chartInput }) => {
  const { t } = useTranslation();

  if (!chartInput) {
    return (
      <div className="flex flex-col items-center justify-center w-full bg-transparent p-12">
        <div className="w-full h-[380px] glass-effect rounded-xl flex items-center justify-center border-dashed">
          <p className="text-zinc-500 font-bold tracking-wider text-[10px]">{t('waiting_for_data')}</p>
        </div>
      </div>
    );
  }

  if (chartInput.mode === 'dashboard' || Array.isArray(chartInput.charts)) {
    return <Dashboard input={{ mode: 'dashboard', ...chartInput, charts: chartInput.charts ?? [] }} />;
  }

  return (
    <div className="w-full p-2">
      <ChartCard chart={chartInput} />
    </div>
  );
};
