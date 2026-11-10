'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { Button, Input, Skeleton, cn } from '@sps/ui'
import { registryApi, type RegistryEntityPath, type RegistryRecordDto } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { PageIntro } from '@/components/page-intro'
import { ENTITY } from './config'
import { RegistryEditor } from './registry-editor'

const STATUS_STYLE: Record<string, string> = {
  active: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  draft: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  retired: 'border-border bg-muted text-muted-foreground',
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n()
  return <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', STATUS_STYLE[status])}>{t(`registry.status.${status}` as never)}</span>
}

/** The guarantees no registry entry can lift, shown on every registry screen. */
export function GuaranteesNote() {
  const { t } = useI18n()
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-3 text-[11px] text-muted-foreground">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
      <p>{t('registry.guarantees')}</p>
    </div>
  )
}

export function RegistryList({ path }: { path: RegistryEntityPath }) {
  const { t } = useI18n()
  const router = useRouter()
  const { operator } = useAuth()
  const isAdmin = operator?.role === 'admin'
  const config = ENTITY[path]
  const [items, setItems] = React.useState<RegistryRecordDto[] | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState<'all' | 'active' | 'draft' | 'retired'>('all')
  const [creating, setCreating] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setItems((await registryApi.list(path)).items)
      setProblem(null)
    } catch (cause) {
      setItems([])
      setProblem((cause as Error).message)
    }
  }, [path])

  React.useEffect(() => {
    void load()
  }, [load])

  const needle = query.trim().toLowerCase()
  const visible = (items ?? []).filter(
    (item) => (status === 'all' || item.status === status) && (!needle || `${item.id} ${item.name}`.toLowerCase().includes(needle)),
  )

  return (
    <div className="space-y-4">
      <PageIntro title={t(config.titleKey)} subtitle={t(config.subtitleKey)} />
      <GuaranteesNote />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('registry.search')} className="h-9 rounded-xl pl-8 text-xs" />
        </div>
        {(['all', 'active', 'draft', 'retired'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={cn('rounded-full border px-3 py-1 text-[11px]', status === value ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-border text-muted-foreground')}
          >
            {value === 'all' ? t('registry.all') : t(`registry.status.${value}` as never)}
          </button>
        ))}
        <Button variant="outline" size="sm" onClick={() => void load()} aria-label={t('registry.refresh')}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        {isAdmin && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t(config.newKey)}
          </Button>
        )}
      </div>
      {problem && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[11px] text-destructive">{problem}</p>}
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {items === null
          ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="m-3 h-10" />)
          : visible.length === 0
            ? <p className="px-4 py-6 text-center text-xs text-muted-foreground">{t('registry.empty')}</p>
            : visible.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => router.push(`/${path}/${item.id}`)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <config.icon className={cn('h-4 w-4 shrink-0', path === 'agents' ? (item as { color?: string }).color : 'text-brand-primary')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{item.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      <span className="font-mono">{item.id}</span> · {config.summary(item as unknown as Record<string, unknown>)}
                    </p>
                  </div>
                  {item.builtIn && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      {t('registry.builtIn')}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">v{item.version}</span>
                  <StatusBadge status={item.status} />
                </button>
              ))}
      </div>
      <RegistryEditor path={path} open={creating} onOpenChange={setCreating} onSaved={(record) => router.push(`/${path}/${record.id}`)} />
    </div>
  )
}
