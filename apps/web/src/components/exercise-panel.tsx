'use client'

/**
 * N8 — table-top crisis exercise.
 *
 * The panel is a clock and a log, not a chat. Injects appear when their minute
 * comes, the team records what it actually did, and the score is computed from
 * that log by `@sps/exercise` before the model is asked for prose. The order is
 * deliberate: the after-action narrative can be wrong, the coverage number
 * cannot.
 */

import * as React from 'react'
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, Plus, Timer, Trash2 } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Select, cn } from '@sps/ui'
import { institutionsForDomain, type Domain } from '@sps/shared'
import {
  api,
  type AfterActionDto,
  type ExerciseActionDto,
  type ExerciseActionKind,
  type ExerciseDefinitionDto,
  type ExerciseEvaluationDto,
} from '@/lib/api'
import { useI18n } from '@/lib/i18n'

const KINDS: ExerciseActionKind[] = ['action', 'decision', 'escalation', 'note']

const SEVERITY_TONE: Record<string, string> = {
  low: 'border-border bg-muted/40',
  medium: 'border-amber-500/40 bg-amber-500/10',
  high: 'border-orange-500/40 bg-orange-500/10',
  critical: 'border-rose-500/50 bg-rose-500/10',
}

const KIND_TONE: Record<ExerciseActionKind, string> = {
  action: 'bg-primary/15 text-primary',
  decision: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  escalation: 'bg-rose-500/15 text-rose-500',
  note: 'bg-muted text-muted-foreground',
}

export function ExercisePanel({ country, domain }: { country: string; domain: Domain }) {
  const { t } = useI18n()
  const institutions = React.useMemo(() => institutionsForDomain(domain), [domain])
  const actorName = React.useCallback(
    (id: string) => institutions.find((item) => item.id === id)?.name ?? id,
    [institutions],
  )

  const [definition, setDefinition] = React.useState<ExerciseDefinitionDto | null>(null)
  const [actions, setActions] = React.useState<ExerciseActionDto[]>([])
  const [clock, setClock] = React.useState(0)
  const [evaluation, setEvaluation] = React.useState<ExerciseEvaluationDto | null>(null)
  const [afterAction, setAfterAction] = React.useState<AfterActionDto | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [evaluating, setEvaluating] = React.useState(false)
  const [generating, setGenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [form, setForm] = React.useState<{
    actor: string
    kind: ExerciseActionKind
    injectId: string
    text: string
  }>({ actor: institutions[0]?.id ?? 'coordinator', kind: 'action', injectId: '', text: '' })

  const load = React.useCallback(async () => {
    setDefinition(null)
    setActions([])
    setClock(0)
    setEvaluation(null)
    setAfterAction(null)
    setError(null)
    setLoading(true)
    try {
      setDefinition(await api.exerciseSample(country))
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setLoading(false)
    }
  }, [country])

  React.useEffect(() => {
    void load()
  }, [load])

  const released = React.useMemo(
    () => (definition?.injects ?? []).filter((inject) => inject.atMinute <= clock),
    [definition, clock],
  )

  const resetScoring = () => {
    setEvaluation(null)
    setAfterAction(null)
  }

  const addAction = () => {
    const text = form.text.trim()
    if (!text) return
    setActions((previous) => [
      ...previous,
      {
        atMinute: clock,
        actor: form.actor,
        kind: form.kind,
        text,
        ...(form.injectId ? { injectId: form.injectId } : {}),
      },
    ])
    setForm((previous) => ({ ...previous, text: '' }))
    resetScoring()
  }

  const removeAction = (index: number) => {
    setActions((previous) => previous.filter((_, position) => position !== index))
    resetScoring()
  }

  const score = async () => {
    if (!definition) return
    setEvaluating(true)
    setError(null)
    try {
      setEvaluation(
        await api.evaluateExercise({ definition, actions, evaluatedAtMinute: clock }),
      )
      setAfterAction(null)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setEvaluating(false)
    }
  }

  const writeReport = async () => {
    if (!definition) return
    setGenerating(true)
    setError(null)
    try {
      const report = await api.exerciseAfterAction({ definition, actions, evaluatedAtMinute: clock })
      setEvaluation(report)
      setAfterAction(report)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const coverage = evaluation ? Math.round(evaluation.coverage * 100) : null

  return (
    <Card>
      <CardHeader>
        <ClipboardList className="h-4 w-4 text-primary" />
        <CardTitle>{t('exercise.title')}</CardTitle>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t('exercise.subtitle')}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('exercise.hint')}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading || evaluating || generating}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Timer className="h-3.5 w-3.5" aria-hidden />}
            {definition ? t('exercise.reload') : t('exercise.load')}
          </Button>
          {definition && (
            <span className="text-[11px] text-muted-foreground">
              {definition.title} · {t('exercise.duration', { minutes: definition.durationMinutes })}
            </span>
          )}
        </div>

        {error && (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-500">
            {t('exercise.error')} {error}
          </p>
        )}

        {!definition && !loading && (
          <p className="text-sm text-muted-foreground">{t('exercise.empty')}</p>
        )}

        {definition && (
          <>
            <div className="rounded-xl border border-border p-2.5">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-black tracking-widest text-muted-foreground">
                  {t('exercise.clock')}
                </span>
                <span className="font-mono text-xs font-semibold">
                  {t('exercise.minute', { minute: clock })}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={definition.durationMinutes}
                step={1}
                value={clock}
                aria-label={t('exercise.clock')}
                onChange={(event) => {
                  setClock(Number(event.target.value))
                  resetScoring()
                }}
                className="w-full accent-[var(--primary)]"
              />
              <div className="mt-1 flex flex-wrap gap-1.5">
                {[5, 15, 30].map((step) => (
                  <Button
                    key={step}
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setClock((value) => Math.min(definition.durationMinutes, value + step))
                      resetScoring()
                    }}
                  >
                    +{step} min
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setClock(definition.durationMinutes)
                    resetScoring()
                  }}
                >
                  {t('exercise.minute', { minute: definition.durationMinutes })}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-black tracking-widest text-muted-foreground">
                {t('exercise.injects')}
              </p>
              {released.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('exercise.noInjects')}</p>
              )}
              {released.map((inject) => (
                <div
                  key={inject.id}
                  className={cn('rounded-xl border p-2 text-xs', SEVERITY_TONE[inject.severity ?? 'low'])}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      T+{inject.atMinute}
                    </span>
                    <span className="font-semibold">{inject.title}</span>
                    {inject.severity && (
                      <span className="rounded bg-background/60 px-1 text-[9px] uppercase tracking-wide">
                        {t(`severity.${inject.severity}` as 'severity.high')}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {t('exercise.window', { minutes: inject.responseWindowMinutes ?? 15 })}
                    </span>
                  </div>
                  <p className="mt-1 leading-relaxed">{inject.detail}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('exercise.expected')}: {inject.expectedAction}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {t('exercise.visibleTo', { agents: inject.visibleTo.map(actorName).join(', ') })}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border p-2.5">
              <p className="mb-2 text-[10px] font-black tracking-widest text-muted-foreground">
                {t('exercise.logTitle')}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">{t('exercise.actor')}</span>
                  <Select
                    ariaLabel={t('exercise.actor')}
                    value={form.actor}
                    onValueChange={(value) => setForm((previous) => ({ ...previous, actor: value }))}
                    options={institutions.map((institution) => ({
                      value: institution.id,
                      label: institution.name,
                    }))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">{t('exercise.kind')}</span>
                  <Select
                    ariaLabel={t('exercise.kind')}
                    value={form.kind}
                    onValueChange={(value) =>
                      setForm((previous) => ({ ...previous, kind: value as ExerciseActionKind }))
                    }
                    options={KINDS.map((kind) => ({
                      value: kind,
                      label: t(`exercise.kind.${kind}` as 'exercise.kind.action'),
                    }))}
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-[10px] text-muted-foreground">{t('exercise.inject')}</span>
                  <Select
                    ariaLabel={t('exercise.inject')}
                    value={form.injectId}
                    onValueChange={(value) => setForm((previous) => ({ ...previous, injectId: value }))}
                    options={[
                      { value: '', label: t('exercise.noInject') },
                      ...released.map((inject) => ({ value: inject.id, label: `${inject.id} · ${inject.title}` })),
                    ]}
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-[10px] text-muted-foreground">{t('exercise.text')}</span>
                  <textarea
                    value={form.text}
                    onChange={(event) => setForm((previous) => ({ ...previous, text: event.target.value }))}
                    placeholder={t('exercise.textPlaceholder')}
                    rows={2}
                    maxLength={2000}
                    className="w-full rounded-xl border border-border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </div>
              <Button size="sm" className="mt-2" onClick={addAction} disabled={!form.text.trim()}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t('exercise.add')}
              </Button>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-black tracking-widest text-muted-foreground">
                {t('exercise.actions')}
              </p>
              {actions.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('exercise.noActions')}</p>
              )}
              <ul className="space-y-1">
                {actions.map((action, index) => (
                  <li
                    key={`${action.atMinute}-${index}-${action.text.slice(0, 8)}`}
                    className="flex items-start gap-2 rounded-lg border border-border px-2 py-1 text-[11px]"
                  >
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">T+{action.atMinute}</span>
                    <span className={cn('shrink-0 rounded px-1 text-[9px] uppercase', KIND_TONE[action.kind])}>
                      {t(`exercise.kind.${action.kind}` as 'exercise.kind.action')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="font-semibold">{actorName(action.actor)}</strong>
                      {action.injectId ? ` · ${action.injectId}` : ''} — {action.text}
                    </span>
                    <button
                      type="button"
                      aria-label={t('exercise.remove')}
                      onClick={() => removeAction(index)}
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void score()} disabled={evaluating || generating}>
                {evaluating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                {evaluating ? t('exercise.evaluating') : t('exercise.evaluate', { minute: clock })}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void writeReport()}
                disabled={evaluating || generating || actions.length === 0}
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                {generating ? t('exercise.generating') : t('exercise.afterAction')}
              </Button>
            </div>

            {evaluation && (
              <div className="space-y-2 rounded-xl border border-border p-2.5">
                <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
                  <Metric label={t('exercise.coverage')} value={coverage === null ? '—' : `${coverage}%`} strong={coverage === 100} />
                  <Metric label={t('exercise.released')} value={String(evaluation.releasedInjects)} />
                  <Metric label={t('exercise.addressed')} value={String(evaluation.addressed.length)} />
                  <Metric label={t('exercise.missed')} value={String(evaluation.missed.length)} />
                  <Metric
                    label={t('exercise.average')}
                    value={
                      evaluation.averageResponseMinutes === null
                        ? '—'
                        : t('exercise.minutes', { value: evaluation.averageResponseMinutes })
                    }
                  />
                  <Metric
                    label={t('exercise.firstAction')}
                    value={
                      evaluation.firstActionMinute === null
                        ? '—'
                        : t('exercise.minute', { minute: evaluation.firstActionMinute })
                    }
                  />
                </div>

                {evaluation.missed.length === 0 ? (
                  <p className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    {t('exercise.noGaps')}
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {evaluation.missed.map((item) => (
                      <li
                        key={`${item.injectId}-${item.reason}`}
                        className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-1.5 text-[11px]"
                      >
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                          {item.injectId} · {item.title}
                        </span>
                        <span className="ml-1 rounded bg-background/60 px-1 text-[9px] uppercase">
                          {item.reason === 'late' ? t('exercise.late') : t('exercise.noAction')}
                        </span>
                        <p className="mt-0.5 text-muted-foreground">{item.expectedAction}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {afterAction && (
              <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-2.5">
                <p className="text-[10px] font-black tracking-widest text-muted-foreground">
                  {t('exercise.narrative')} · {afterAction.model}
                </p>
                <p className="text-xs leading-relaxed">{afterAction.narrative.summary}</p>
                {(
                  [
                    { label: t('exercise.lessons'), items: afterAction.narrative.lessons },
                    { label: t('exercise.recommendations'), items: afterAction.narrative.recommendations },
                    { label: t('exercise.unresolved'), items: afterAction.narrative.unresolved },
                  ] as Array<{ label: string; items: string[] }>
                )
                  .filter((section) => section.items.length > 0)
                  .map((section) => (
                    <div key={section.label}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {section.label}
                      </p>
                      <ul className="list-disc space-y-0.5 pl-4 text-[11px]">
                        {section.items.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-secondary/60 px-2 py-1">
      <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <strong className={strong ? 'text-emerald-600 dark:text-emerald-400' : undefined}>{value}</strong>
    </div>
  )
}
