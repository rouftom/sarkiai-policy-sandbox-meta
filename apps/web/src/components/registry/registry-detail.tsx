'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Ban, CheckCircle2, History, Lock, MessageSquare, Pencil, RotateCcw } from 'lucide-react'
import { Button, Skeleton } from '@sps/ui'
import { ApiError, registryApi, type RegistryEntityPath, type RegistryRecordDto, type RegistryStatusDto, type RegistryVersionDto } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { PageIntro } from '@/components/page-intro'
import { ENTITY } from './config'
import { RegistryEditor } from './registry-editor'
import { GuaranteesNote, StatusBadge } from './registry-list'

function display(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (Array.isArray(value)) {
    if (value.length === 0) return '—'
    return value
      .map((item) => (typeof item === 'object' && item ? `${(item as { filename?: string }).filename ?? ''}${(item as { article?: string }).article ? ` art. ${(item as { article?: string }).article}` : ''}` : String(item)))
      .join(' · ')
  }
  if (typeof value === 'boolean') return value ? '✓' : '—'
  return String(value)
}

export function RegistryDetail({ path, id }: { path: RegistryEntityPath; id: string }) {
  const { t } = useI18n()
  const { operator } = useAuth()
  const isAdmin = operator?.role === 'admin'
  const config = ENTITY[path]
  const [record, setRecord] = React.useState<RegistryRecordDto | null>(null)
  const [versions, setVersions] = React.useState<RegistryVersionDto[]>([])
  const [problem, setProblem] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const [current, history] = await Promise.all([registryApi.get(path, id), registryApi.versions(path, id)])
      setRecord(current)
      setVersions(history.versions)
      setProblem(null)
    } catch (cause) {
      setProblem((cause as Error).message)
    }
  }, [path, id])

  React.useEffect(() => {
    void load()
  }, [load])

  const changeStatus = async (status: RegistryStatusDto) => {
    setBusy(true)
    setProblem(null)
    try {
      setRecord(await registryApi.setStatus(path, id, status))
      setVersions((await registryApi.versions(path, id)).versions)
    } catch (cause) {
      const text = cause instanceof ApiError ? cause.body : (cause as Error).message
      let details: string[] = []
      try {
        details = (JSON.parse(text) as { details?: string[] }).details ?? []
      } catch {
        // plain message
      }
      setProblem(details.length ? `${t('registry.blocked')} ${details.map((d) => t(`registry.problem.${d}` as never)).join(' · ')}` : (cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageIntro
        title={record?.name ?? id}
        subtitle={t(config.subtitleKey)}
        leading={
          <Link href={`/${path}`} aria-label={t('registry.back')} className="mr-2 flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        }
      />
      {problem && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[11px] text-destructive">{problem}</p>}
      {!record ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={record.status} />
            <span className="text-[11px] text-muted-foreground">
              v{record.version} · {t('registry.updated', { by: record.updatedBy, at: new Date(record.updatedAt).toLocaleString() })}
            </span>
            {record.builtIn && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" />
                {t('registry.builtIn')}
              </span>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              {path === 'agents' && record.status === 'active' && (
                <Link
                  href={`/?assistant=${encodeURIComponent(record.id)}`}
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs hover:bg-muted"
                >
                  <MessageSquare className="mr-1 h-3.5 w-3.5" />
                  {t('registry.try')}
                </Link>
              )}
              {isAdmin && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={busy}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    {t('registry.editShort')}
                  </Button>
                  {record.status !== 'active' && (
                    <Button size="sm" onClick={() => void changeStatus('active')} disabled={busy}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      {t('registry.activate')}
                    </Button>
                  )}
                  {record.status === 'active' && (
                    <Button variant="outline" size="sm" onClick={() => void changeStatus('retired')} disabled={busy}>
                      <Ban className="mr-1 h-3.5 w-3.5" />
                      {t('registry.retire')}
                    </Button>
                  )}
                  {record.status === 'retired' && (
                    <Button variant="outline" size="sm" onClick={() => void changeStatus('draft')} disabled={busy}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      {t('registry.toDraft')}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          <dl className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            {config.fields.map((field) => (
              <div key={field.key} className="bg-card px-4 py-3">
                <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t(field.labelKey)}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-xs">{display((record as unknown as Record<string, unknown>)[field.key])}</dd>
              </div>
            ))}
          </dl>
          <GuaranteesNote />
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-xs font-semibold">
              <History className="h-3.5 w-3.5" />
              {t('registry.versions')}
            </h2>
            {versions.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">{t('registry.noVersions')}</p>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
                {versions.map((version) => (
                  <li key={version.version} className="flex items-center gap-3 px-4 py-2 text-[11px]">
                    <span className="font-mono">v{version.version}</span>
                    <StatusBadge status={String(version.snapshot.status ?? 'draft')} />
                    <span className="text-muted-foreground">{version.savedBy}</span>
                    <span className="ml-auto text-muted-foreground">{new Date(version.savedAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <RegistryEditor path={path} open={editing} onOpenChange={setEditing} record={record} onSaved={(saved) => {
            setRecord(saved)
            void registryApi.versions(path, id).then((history) => setVersions(history.versions))
          }} />
        </>
      )}
    </div>
  )
}
