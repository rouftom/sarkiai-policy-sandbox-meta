'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus, RefreshCw, RotateCcw, TriangleAlert, X } from 'lucide-react'
import { MATURITY_RAMP } from '@sps/theme'
import { Badge, Button, cn } from '@sps/ui'
import type { WorldSummaryEntryDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'
import { CountryFlag } from '@/components/country-flag'
import { MAP_NEUTRAL, mapPaint } from './world-map-style'
import { WORLD_MAP_HEIGHT, WORLD_MAP_NAMES, WORLD_MAP_PATHS, WORLD_MAP_WIDTH } from './world-geo'
import { STATE_META } from './world-model'

type View = { x: number; y: number; w: number; h: number }

const FULL_VIEW: View = { x: 0, y: 0, w: WORLD_MAP_WIDTH, h: WORLD_MAP_HEIGHT }
const MAX_ZOOM = 8

/** Keeps the viewBox inside the map and its aspect ratio stable while zooming. */
function clampView(view: View): View {
  const w = Math.min(WORLD_MAP_WIDTH, Math.max(WORLD_MAP_WIDTH / MAX_ZOOM, view.w))
  const h = (w * WORLD_MAP_HEIGHT) / WORLD_MAP_WIDTH
  return {
    w,
    h,
    x: Math.min(Math.max(0, view.x), WORLD_MAP_WIDTH - w),
    y: Math.min(Math.max(0, view.y), WORLD_MAP_HEIGHT - h),
  }
}

function centerZoom(view: View, factor: number): View {
  const next = clampView({ ...view, w: view.w / factor })
  return clampView({
    ...next,
    x: view.x + (view.w - next.w) / 2,
    y: view.y + (view.h - next.h) / 2,
  })
}

export interface WorldMapProps {
  entries: WorldSummaryEntryDto[]
  nameOf: (code: string) => string
  dateFormat: Intl.DateTimeFormat
  percent: Intl.NumberFormat
  loading: boolean
  empty: boolean
  problem: string | null
  onRetry: () => void
}

/**
 * Interactive world choropleth. The geometry is committed (see
 * `scripts/build-world-geo.ts`), so the map renders immediately, even before
 * the summary arrives or when it is empty: the shape of the world is never
 * replaced by a skeleton or a placeholder.
 */
export function WorldMap({ entries, nameOf, dateFormat, percent, loading, empty, problem, onRetry }: WorldMapProps) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const { setCountry } = useWorkspace()
  const [view, setView] = React.useState<View>(FULL_VIEW)
  const [selected, setSelected] = React.useState<string | null>(null)
  const [hover, setHover] = React.useState<{ code: string; x: number; y: number } | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const svgRef = React.useRef<SVGSVGElement>(null)
  const drag = React.useRef<{ clientX: number; clientY: number; view: View; moved: boolean; code: string | null } | null>(
    null,
  )
  const justPanned = React.useRef(false)

  const byCode = React.useMemo(() => new Map(entries.map((entry) => [entry.code, entry])), [entries])

  // Registry names win; the committed Natural Earth names cover the rest of the
  // world. Never `Intl.DisplayNames`: the server and the browser bundle
  // different ICU data, so the label would change between the two renders.
  const nameOfRegion = React.useCallback(
    (code: string) => {
      const known = nameOf(code)
      if (known !== code.toUpperCase()) return known
      const geoName = WORLD_MAP_NAMES[code]
      if (!geoName) return code.toUpperCase()
      return locale === 'fr' ? geoName.fr : geoName.en
    },
    [nameOf, locale],
  )

  const selectedEntry = selected ? (byCode.get(selected) ?? null) : null

  // Escape closes the sheet, as a dialog would.
  React.useEffect(() => {
    if (!selected) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  /** Working on a country starts by making it the workspace country. */
  const openAssessment = (code: string) => {
    setCountry(code)
    router.push('/readiness')
  }

  // Ctrl/⌘ + wheel zooms without taking the page scroll hostage.
  React.useEffect(() => {
    const element = svgRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      setView((current) => {
        const scale = event.deltaY < 0 ? 1.3 : 1 / 1.3
        const w = Math.min(WORLD_MAP_WIDTH, Math.max(WORLD_MAP_WIDTH / MAX_ZOOM, current.w / scale))
        const h = (w * WORLD_MAP_HEIGHT) / WORLD_MAP_WIDTH
        const px = current.x + ((event.clientX - rect.left) / rect.width) * current.w
        const py = current.y + ((event.clientY - rect.top) / rect.height) * current.h
        return clampView({
          w,
          h,
          x: px - ((px - current.x) * w) / current.w,
          y: py - ((py - current.y) * h) / current.h,
        })
      })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const countryAt = (target: EventTarget | null): string | null => {
    if (!(target instanceof Element)) return null
    return target.closest('[data-country]')?.getAttribute('data-country') ?? null
  }

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    justPanned.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    // The country is read now: once the pointer is captured by the SVG, every
    // later event targets the SVG itself, not the shape under the finger.
    drag.current = { clientX: event.clientX, clientY: event.clientY, view, moved: false, code: countryAt(event.target) }
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const code = countryAt(event.target)
    const container = containerRef.current
    if (code && container) {
      const rect = container.getBoundingClientRect()
      setHover({ code, x: event.clientX - rect.left, y: event.clientY - rect.top })
    } else if (!drag.current) {
      setHover(null)
    }

    const current = drag.current
    if (!current) return
    const dx = event.clientX - current.clientX
    const dy = event.clientY - current.clientY
    if (!current.moved && Math.hypot(dx, dy) < 4) return
    current.moved = true
    justPanned.current = true
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    setView(
      clampView({
        ...current.view,
        x: current.view.x - (dx / rect.width) * current.view.w,
        y: current.view.y - (dy / rect.height) * current.view.h,
      }),
    )
  }

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const current = drag.current
    const panned = justPanned.current
    drag.current = null
    justPanned.current = false
    // A tap selects: a drag pans. Pointer capture retargets the browser's
    // `click` to the SVG, so the shape's own `onClick` never fires.
    if (current && !current.moved && !panned && current.code) choose(current.code)
  }

  const handlePointerCancel = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    drag.current = null
    justPanned.current = false
  }

  const choose = (code: string) => {
    if (justPanned.current) return
    setSelected((current) => (current === code ? null : code))
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="space-y-2">
        {problem && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {t('world.error')} {problem}
            </span>
            <Button variant="ghost" size="sm" onClick={onRetry}>
              {t('world.retry')}
            </Button>
          </div>
        )}

        {empty && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2">
            <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">{t('world.map.empty')}</p>
            <Button variant="outline" size="sm" onClick={() => router.push('/readiness')}>
              {t('world.empty.action')}
            </Button>
          </div>
        )}

        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-2xl border border-border bg-[var(--app-panel-bg)]"
          aria-busy={loading || undefined}
        >
          <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-border bg-card/90 p-1 shadow-sm backdrop-blur-sm">
            <Button
              variant="ghost"
              size="icon"
              className="pointer-events-auto h-7 w-7"
              aria-label={t('world.map.zoomIn')}
              title={t('world.map.zoomIn')}
              onClick={() => setView((current) => centerZoom(current, 1.5))}
              disabled={view.w <= WORLD_MAP_WIDTH / MAX_ZOOM + 0.01}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="pointer-events-auto h-7 w-7"
              aria-label={t('world.map.zoomOut')}
              title={t('world.map.zoomOut')}
              onClick={() => setView((current) => centerZoom(current, 1 / 1.5))}
              disabled={view.w >= WORLD_MAP_WIDTH - 0.01}
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="pointer-events-auto h-7 w-7"
              aria-label={t('world.map.reset')}
              title={t('world.map.reset')}
              onClick={() => setView(FULL_VIEW)}
              disabled={view.w >= WORLD_MAP_WIDTH - 0.01 && view.x === 0 && view.y === 0}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>

          {loading && (
            <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
              <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
              {t('world.loading')}
            </div>
          )}

          <svg
            ref={svgRef}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            role="group"
            aria-label={t('world.map.label')}
            className="block h-auto max-h-[64vh] w-full touch-none select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onPointerLeave={() => setHover(null)}
          >
            {WORLD_MAP_PATHS.map(([code, path]) => {
              const entry = byCode.get(code)
              const paint = mapPaint(entry)
              const isSelected = selected === code
              return (
                <path
                  key={code}
                  d={path}
                  data-country={code}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    entry
                      ? `${nameOfRegion(code)} · ${t(STATE_META[entry.state].label)}`
                      : `${nameOfRegion(code)} · ${t('world.state.not-assessed')}`
                  }
                  aria-pressed={isSelected}
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={isSelected ? 1.8 : 0.5}
                  style={paint.fill ? { fill: paint.fill } : undefined}
                  className={cn(
                    'cursor-pointer stroke-white/80 outline-none transition-opacity duration-150 hover:opacity-70 hover:fill-slate-300/90 focus-visible:opacity-75 dark:stroke-black/40 dark:hover:fill-slate-600/60',
                    paint.className,
                    isSelected && 'stroke-foreground dark:stroke-white',
                  )}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    choose(code)
                  }}
                />
              )
            })}
          </svg>

          {hover && (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-card/95 px-2 py-1.5 text-[10px] shadow-lg backdrop-blur-sm"
              style={{ left: hover.x, top: hover.y - 6 }}
            >
              <HoverCard code={hover.code} entry={byCode.get(hover.code)} nameOfRegion={nameOfRegion} />
            </div>
          )}

          {/* Below `lg` the sheet has no column of its own: it opens over the map,
              right where the country was tapped, instead of below the fold. */}
          {selected && (
            <div className="custom-scrollbar absolute inset-x-2 bottom-2 z-30 max-h-[72%] overflow-y-auto lg:hidden">
              <CountrySheet
                code={selected}
                entry={selectedEntry}
                nameOfRegion={nameOfRegion}
                dateFormat={dateFormat}
                percent={percent}
                onClose={() => setSelected(null)}
                onOpenAssessment={() => openAssessment(selected)}
              />
            </div>
          )}
        </div>

        <MapLegend />
      </div>

      <div className="hidden lg:block">
        <CountrySheet
          code={selected}
          entry={selectedEntry}
          nameOfRegion={nameOfRegion}
          dateFormat={dateFormat}
          percent={percent}
          onClose={selected ? () => setSelected(null) : undefined}
          onOpenAssessment={selected ? () => openAssessment(selected) : undefined}
        />
      </div>
    </div>
  )
}

function HoverCard({
  code,
  entry,
  nameOfRegion,
}: {
  code: string
  entry: WorldSummaryEntryDto | undefined
  nameOfRegion: (code: string) => string
}) {
  const { t } = useI18n()
  const meta = entry ? STATE_META[entry.state] : STATE_META['not-assessed']
  return (
    <div className="min-w-28">
      <p className="font-medium text-foreground">{nameOfRegion(code)}</p>
      <p className="text-muted-foreground">
        {t(meta.label)}
        {entry?.composite != null && ` · ${entry.composite.toFixed(2)}`}
      </p>
    </div>
  )
}

function MapLegend() {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <span className="underline decoration-dotted underline-offset-2">{t('world.map.legend.maturity')}</span>
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {MATURITY_RAMP.map((color) => (
            <span key={color} className="h-2.5 w-3.5" style={{ backgroundColor: color }} />
          ))}
        </span>
        <span aria-hidden="true">0–5</span>
      </div>
      <span className="flex items-center gap-1.5">
        <span className={cn('h-2.5 w-3.5 border border-border', MAP_NEUTRAL)} aria-hidden="true" />
        {t('world.state.not-assessed')}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 bg-amber-200/70 dark:bg-amber-200/20" aria-hidden="true" />
        {t('world.state.no-grounded-data')}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 bg-amber-400/70 dark:bg-amber-300/30" aria-hidden="true" />
        {t('world.state.low-confidence')}
      </span>
      <span className="hidden sm:inline">{t('world.map.hint')}</span>
    </div>
  )
}

function CountrySheet({
  code,
  entry,
  nameOfRegion,
  dateFormat,
  percent,
  onClose,
  onOpenAssessment,
}: {
  code: string | null
  entry: WorldSummaryEntryDto | null
  nameOfRegion: (code: string) => string
  dateFormat: Intl.DateTimeFormat
  percent: Intl.NumberFormat
  onClose?: () => void
  onOpenAssessment?: () => void
}) {
  const { t } = useI18n()
  const router = useRouter()

  if (!code) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-border px-4 py-6 text-center">
        <p className="max-w-56 text-[11px] text-muted-foreground">{t('world.map.sheet.none')}</p>
      </div>
    )
  }

  const meta = entry ? STATE_META[entry.state] : STATE_META['not-assessed']
  const StateIcon = meta.icon
  const unregistered = !entry || entry.registryStatus === 'unregistered'

  return (
    <aside
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-3 py-3 shadow-lg lg:shadow-none"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <CountryFlag code={code} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{nameOfRegion(code)}</p>
          <p className="font-mono text-[9px] uppercase text-muted-foreground">{code}</p>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="-mr-1 -mt-1 h-6 w-6 shrink-0"
            aria-label={t('common.close')}
            title={t('common.close')}
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <Badge tone={meta.tone} className="text-[9px]">
          <StateIcon className="h-3 w-3" aria-hidden="true" />
          {t(meta.label)}
        </Badge>
        <p className="text-[10px] leading-snug text-muted-foreground">{t(meta.hint)}</p>
      </div>

      {entry && (
        <>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
            <div>
              <dt className="text-muted-foreground">{t('world.table.composite')}</dt>
              <dd className="text-[12px] font-semibold tabular-nums text-foreground">
                {entry.composite === null ? '—' : entry.composite.toFixed(2)}
                {entry.band && <span className="ml-1 text-[9px] font-normal text-muted-foreground">{entry.band}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('world.table.coverage')}</dt>
              <dd className="text-[12px] tabular-nums text-foreground">
                {entry.coverage === null ? '—' : percent.format(entry.coverage)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('world.table.confidence')}</dt>
              <dd className="text-[12px] tabular-nums text-foreground">
                {entry.confidence === null ? '—' : percent.format(entry.confidence)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('world.table.runs')}</dt>
              <dd className="text-[12px] tabular-nums text-foreground">{entry.runs}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">{t('world.table.lastRun')}</dt>
              <dd className="flex flex-wrap items-center gap-1.5 text-[11px] text-foreground">
                {entry.lastRunAt === null ? '—' : dateFormat.format(new Date(entry.lastRunAt))}
                {entry.stale && (
                  <Badge tone="warning" className="text-[9px]">
                    {t('world.stale')}
                  </Badge>
                )}
              </dd>
            </div>
          </dl>

          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">
              {t('world.table.sectors')} · {t('world.sectors.count', { count: entry.sectors.length, total: 5 })}
            </p>
            <div className="flex flex-wrap gap-1">
              {entry.sectors.length === 0 ? (
                <span className="text-[10px] text-muted-foreground">—</span>
              ) : (
                entry.sectors.map((sector) => (
                  <Badge key={sector} tone="neutral" className="text-[9px]">
                    {t(`domain.${sector}`)}
                  </Badge>
                ))
              )}
            </div>
          </div>

          <Badge tone={entry.registryStatus === 'active' ? 'brand' : 'neutral'} className="w-fit text-[9px]">
            {t(
              entry.registryStatus === 'active'
                ? 'world.registry.active'
                : entry.registryStatus === 'planned'
                  ? 'world.registry.planned'
                  : 'world.registry.unregistered',
            )}
          </Badge>
        </>
      )}

      {unregistered && <p className="text-[10px] leading-snug text-muted-foreground">{t('world.map.sheet.unregistered')}</p>}

      <div className="mt-auto flex flex-wrap gap-1.5">
        {unregistered ? (
          <Button variant="outline" size="sm" onClick={() => router.push('/countries')}>
            {t('world.map.sheet.registry')}
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onOpenAssessment}>
            {t('world.empty.action')}
          </Button>
        )}
      </div>
    </aside>
  )
}
