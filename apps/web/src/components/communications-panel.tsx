'use client'

/**
 * N9 · public-communication drafts in Fulfulde or Hausa.
 *
 * What the panel shows is deliberately not a publish button. The model drafts,
 * the policy gate can refuse the draft outright, and everything that survives
 * carries a `pending native review` badge: a native speaker is the only person
 * who can approve the language. The wording of that badge is a feature.
 */

import * as React from 'react'
import { AlertTriangle, Languages, Loader2, ShieldAlert } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@sps/ui'
import {
  ApiError,
  api,
  type CommunicationDraftDto,
  type CommunicationLanguageCode,
  type CommunicationLanguageDto,
} from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { ProcessingBar } from '@/components/processing-bar'

const CHANNELS = ['radio', 'sms', 'social', 'press'] as const
type Channel = (typeof CHANNELS)[number]

/** Shown before the API answers, and used when the language endpoint is down. */
const FALLBACK_LANGUAGES: CommunicationLanguageDto[] = [
  {
    code: 'ff',
    name: 'Fulfulde',
    script: 'Latin (Adamawa variants may use modified letters)',
    region: 'West and Central Africa',
    note: 'Prefer the vocabulary used by local radio.',
  },
  {
    code: 'ha',
    name: 'Hausa',
    script: 'Boko (Latin)',
    region: 'southern Niger, northern Nigeria',
    note: 'Prefer plain Hausa used on radio.',
  },
]

export function CommunicationsPanel({ country }: { country: string }) {
  const { locale, t } = useI18n()
  const [languages, setLanguages] = React.useState<CommunicationLanguageDto[]>(FALLBACK_LANGUAGES)
  const [language, setLanguage] = React.useState<CommunicationLanguageCode>('ff')
  const [audience, setAudience] = React.useState('')
  const [jurisdiction, setJurisdiction] = React.useState(country.toUpperCase())
  const [facts, setFacts] = React.useState('')
  const [channels, setChannels] = React.useState<Channel[]>(['radio', 'sms'])
  const [draft, setDraft] = React.useState<CommunicationDraftDto | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [violations, setViolations] = React.useState<string[]>([])

  React.useEffect(() => {
    let cancelled = false
    api
      .communicationLanguages()
      .then((items) => {
        if (!cancelled && items.length > 0) setLanguages(items)
      })
      .catch(() => {
        // The fallback list is enough to draft; the API stays the source of truth.
      })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    setJurisdiction(country.toUpperCase())
  }, [country])

  const toggleChannel = (channel: Channel) => {
    setChannels((previous) =>
      previous.includes(channel) ? previous.filter((item) => item !== channel) : [...previous, channel],
    )
  }

  const draftMessage = async () => {
    setBusy(true)
    setError(null)
    setViolations([])
    try {
      setDraft(
        await api.draftCommunication({
          language,
          sourceLanguage: locale === 'fr' ? 'fr' : 'en',
          audience: audience.trim(),
          jurisdiction: jurisdiction.trim(),
          incidentSummary: facts.trim(),
          channels: channels.length > 0 ? channels : undefined,
        }),
      )
    } catch (cause) {
      setDraft(null)
      if (cause instanceof ApiError && cause.status === 422) {
        const payload = cause.json<{ violations?: string[] }>()
        setViolations(payload?.violations?.length ? payload.violations : [t('comm.error')])
      } else {
        setError((cause as Error).message)
      }
    } finally {
      setBusy(false)
    }
  }

  const ready = audience.trim() && jurisdiction.trim() && facts.trim()

  return (
    <Card>
      <CardHeader>
        <Languages className="h-4 w-4 text-primary" />
        <CardTitle>{t('comm.title')}</CardTitle>
        <span className="ml-auto text-[10px] font-semibold text-muted-foreground">
          {t('comm.subtitle')}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('comm.hint')}</p>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('comm.language')}</span>
            <Select
              ariaLabel={t('comm.language')}
              value={language}
              onValueChange={(value) => {
                setLanguage(value as CommunicationLanguageCode)
                setDraft(null)
                setViolations([])
              }}
              options={languages.map((item) => ({
                value: item.code,
                label: `${item.name} (${item.code})`,
              }))}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground">
              {t('comm.jurisdiction')}
            </span>
            <input
              value={jurisdiction}
              onChange={(event) => setJurisdiction(event.target.value)}
              maxLength={120}
              className="h-7 w-full rounded-xl border border-border bg-transparent px-2 text-[11px]"
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('comm.audience')}</span>
            <input
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              placeholder={t('comm.audiencePlaceholder')}
              maxLength={300}
              className="h-7 w-full rounded-xl border border-border bg-transparent px-2 text-[11px]"
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('comm.facts')}</span>
            <textarea
              value={facts}
              onChange={(event) => setFacts(event.target.value)}
              placeholder={t('comm.factsPlaceholder')}
              rows={4}
              maxLength={8000}
              className="w-full rounded-xl border border-border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-semibold text-muted-foreground">{t('comm.channels')}</span>
          {CHANNELS.map((channel) => (
            <label key={channel} className="inline-flex items-center gap-1 text-[11px]">
              <input
                type="checkbox"
                checked={channels.includes(channel)}
                onChange={() => toggleChannel(channel)}
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              {t(`comm.channel.${channel}` as 'comm.channel.radio')}
            </label>
          ))}
          <Button size="sm" className="ml-auto" onClick={() => void draftMessage()} disabled={!ready || busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {busy ? t('comm.drafting') : t('comm.draft')}
          </Button>
        </div>

        {busy && <ProcessingBar label={t('comm.drafting')} />}

        {error && (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-500">
            {t('comm.error')} {error}
          </p>
        )}

        {violations.length > 0 && (
          <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-500">
            <p className="inline-flex items-center gap-1.5 font-semibold">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
              {t('comm.blocked')}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {violations.map((violation, index) => (
                <li key={index}>{violation}</li>
              ))}
            </ul>
          </div>
        )}

        {!draft && violations.length === 0 && !busy && (
          <p className="text-sm text-muted-foreground">{t('comm.empty')}</p>
        )}

        {draft && (
          <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                {t('comm.reviewPending')}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {draft.languageName} · {draft.script} · {draft.model}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">{t('comm.reviewHint')}</p>

            <h4 className="text-sm font-black tracking-tight">{draft.title}</h4>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground">{t('comm.message')}</p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed">{draft.message}</p>
            </div>

            <div>
              <p className="text-[10px] font-semibold text-muted-foreground">{t('comm.smsLabel')}</p>
              <p className="rounded-lg bg-background/70 px-2 py-1 font-mono text-[11px]">{draft.sms}</p>
              <span className="text-[10px] text-muted-foreground">{draft.sms.length} / 320</span>
            </div>

            {draft.keyTerms.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground">{t('comm.keyTerms')}</p>
                <div className="mt-1 overflow-hidden rounded-lg border border-border">
                  <Table className="min-w-0">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t('comm.term')}</TableHead>
                        <TableHead>{t('comm.translation')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {draft.keyTerms.map((entry) => (
                        <TableRow key={`${entry.term}-${entry.translation}`}>
                          <TableCell className="font-medium">{entry.term}</TableCell>
                          <TableCell className="text-muted-foreground">{entry.translation}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {draft.caveats.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground">{t('comm.caveats')}</p>
                <ul className="list-disc space-y-0.5 pl-4 text-[11px]">
                  {draft.caveats.map((caveat, index) => (
                    <li key={index}>{caveat}</li>
                  ))}
                </ul>
              </div>
            )}

            {draft.warnings.length > 0 && (
              <div className={cn('rounded-lg border border-amber-500/40 bg-amber-500/10 p-1.5 text-[11px]')}>
                <p className="inline-flex items-center gap-1 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                  {t('comm.warnings')}
                </p>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                  {draft.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
