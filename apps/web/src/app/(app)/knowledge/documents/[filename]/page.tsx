'use client'

/**
 * One document of the knowledge base, edited like the organization's record
 * pages: its details (metadata), its passages (edit or retire each one, the
 * vector is recomputed) and its media (figures to caption, tag, link to a
 * readiness dimension, or remove).
 */

import * as React from 'react'
import Link from 'next/link'
import { documentHref } from '@/lib/kb-links'
import { useParams, useSearchParams } from 'next/navigation'
import { ArrowLeft, FileText, ImageIcon, ListOrdered, Loader, Pencil, RotateCcw, Save, Trash2, X } from 'lucide-react'
import {
  AnimatedTabsList,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  Textarea,
  type TabItem,
} from '@sps/ui'
import { READINESS_DIMENSIONS } from '@sps/shared'
import { PageIntro } from '@/components/page-intro'
import { KbImageUploader } from '@/components/kb-image-uploader'
import { RowActionButton } from '@/components/ui/row-action-button'
import { RowActionMenu } from '@/components/ui/row-action-menu'
import { TableActionItem } from '@/components/ui/table-actions'
import { assetUrl, knowledgeApi, type KbChunkDto, type KbDocumentDto, type KbImageDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { formatSize } from '@/lib/format'

const DOC_TYPES = ['law', 'policy', 'regulation', 'strategy', 'report', 'guidance']
const COUNTRIES = [
  { value: 'cm', label: 'CM' },
  { value: 'global', label: 'Global' },
]

type Tab = 'details' | 'passages' | 'media'

export default function KnowledgeDocumentPage() {
  return (
    <React.Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <DocumentEditor />
    </React.Suspense>
  )
}

function DocumentEditor() {
  const { t } = useI18n()
  const params = useParams<{ filename: string }>()
  const search = useSearchParams()
  const filename = decodeURIComponent(String(params.filename ?? ''))
  const initialTab = (['details', 'passages', 'media'] as const).includes(search.get('tab') as Tab)
    ? (search.get('tab') as Tab)
    : 'details'
  const [tab, setTab] = React.useState<Tab>(initialTab)
  // `mode=view` shows the same screens read-only; the edit icon opens the editor.
  const readOnly = search.get('mode') === 'view'
  const [document, setDocument] = React.useState<KbDocumentDto | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const { documents } = await knowledgeApi.documents({ limit: 200, includeRetired: true })
      setDocument(documents.find((entry) => entry.filename === filename) ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [filename])

  React.useEffect(() => {
    void load()
  }, [load])

  const tabs: TabItem[] = [
    { id: 'details', label: t('kbdoc.tab.details'), icon: FileText },
    { id: 'passages', label: t('kbdoc.tab.passages'), icon: ListOrdered },
    { id: 'media', label: t('kbdoc.tab.media'), icon: ImageIcon },
  ]

  const title = document?.title || filename
  const subtitle = document
    ? [document.country.toUpperCase(), document.docType, formatSize(document.characters), `${document.activeChunks} ${t('knowledge.chunks').toLowerCase()}`, `${document.images?.length ?? 0} ${t('kbdoc.figures').toLowerCase()}`].join(' · ')
    : filename

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
      <PageIntro
        title={title}
        subtitle={subtitle}
        leading={
          <Button variant="ghost" size="icon-sm" className="h-8 w-8 shrink-0 rounded-lg" aria-label={t('kbdoc.back')} title={t('kbdoc.back')} onClick={() => history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && (
            <Link
              href={documentHref(filename, tab, 'edit')}
              aria-label={t('kb.action.edit')}
              title={t('kb.action.edit')}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-brand-primary/10 hover:text-brand-primary dark:hover:text-brand-primary-light"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          )}
          <AnimatedTabsList items={tabs} value={tab} onValueChange={(value) => setTab(value as Tab)} dense />
        </div>
      </PageIntro>

      {error && <p className="mb-3 text-[12px] text-destructive">{error}</p>}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : !document ? (
        <div className="space-y-3 py-12 text-center">
          <p className="text-[12px] text-muted-foreground">{t('kbdoc.notFound')}</p>
          <Link href="/knowledge" className="text-[11px] font-semibold text-brand-primary hover:underline">
            {t('kbdoc.back')}
          </Link>
        </div>
      ) : (
        <fieldset disabled={readOnly} className={readOnly ? 'pointer-events-none min-w-0 opacity-90' : 'min-w-0'}>
          <TabsContent value="details" className="pt-2">
            <DetailsForm document={document} onSaved={load} />
          </TabsContent>
          <TabsContent value="passages" className="pt-2">
            <PassagesTable filename={filename} />
          </TabsContent>
          <TabsContent value="media" className="pt-2">
            <MediaGrid document={document} onChanged={load} />
          </TabsContent>
        </fieldset>
      )}
    </Tabs>
  )
}

function DetailsForm({ document, onSaved }: { document: KbDocumentDto; onSaved: () => Promise<void> }) {
  const { t } = useI18n()
  const [title, setTitle] = React.useState(document.title ?? '')
  const [summary, setSummary] = React.useState(document.summary ?? '')
  const [country, setCountry] = React.useState(document.country)
  const [docType, setDocType] = React.useState(document.docType)
  const [namespace, setNamespace] = React.useState(document.namespace ?? '')
  const [version, setVersion] = React.useState(document.version ?? '')
  const [sourceUrl, setSourceUrl] = React.useState(document.sourceUrl ?? '')
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState<string | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setFailure(null)
    setSaved(null)
    try {
      await knowledgeApi.updateDocument({
        filename: document.filename,
        title,
        summary,
        country,
        docType,
        namespace,
        version,
        sourceUrl,
      })
      setSaved(t('kbdoc.saved'))
      await onSaved()
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  const countryOptions = COUNTRIES.some((entry) => entry.value === country)
    ? COUNTRIES
    : [...COUNTRIES, { value: country, label: country.toUpperCase() }]

  return (
    <div className="max-w-3xl space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('kbdoc.field.title')}>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} className="h-8 text-[12px]" />
        </Field>
        <Field label={t('kbdoc.field.filename')}>
          <Input value={document.filename} readOnly className="h-8 text-[12px] text-muted-foreground" />
        </Field>
        <Field label={t('knowledge.corpus.country')}>
          <Select value={country} onValueChange={setCountry} options={countryOptions} ariaLabel={t('knowledge.corpus.country')} size="md" className="w-40" />
        </Field>
        <Field label={t('knowledge.vectorise.docType')}>
          <Select
            value={docType}
            onValueChange={setDocType}
            options={[...new Set([...DOC_TYPES, docType])].map((value) => ({ value, label: value }))}
            ariaLabel={t('knowledge.vectorise.docType')}
            size="md"
            className="w-40"
          />
        </Field>
        <Field label={t('kbdoc.field.namespace')}>
          <Input value={namespace} onChange={(event) => setNamespace(event.target.value)} className="h-8 text-[12px]" />
        </Field>
        <Field label={t('kbdoc.field.version')}>
          <Input value={version} onChange={(event) => setVersion(event.target.value)} className="h-8 text-[12px]" />
        </Field>
        <Field label={t('kbdoc.field.sourceUrl')} className="sm:col-span-2">
          <Input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://" className="h-8 text-[12px]" />
        </Field>
        <Field label={t('kbdoc.field.summary')} className="sm:col-span-2">
          <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} className="text-[12px]" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {t('kbdoc.save')}
        </Button>
        {saved && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{saved}</span>}
        {failure && <span className="text-[11px] text-destructive">{failure}</span>}
      </div>
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1 ${className ?? ''}`}>
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function PassagesTable({ filename }: { filename: string }) {
  const { t } = useI18n()
  const [chunks, setChunks] = React.useState<KbChunkDto[] | null>(null)
  const [editing, setEditing] = React.useState<KbChunkDto | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      setChunks((await knowledgeApi.chunks(filename)).chunks)
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    }
  }, [filename])

  React.useEffect(() => {
    void load()
  }, [load])

  const toggle = async (chunk: KbChunkDto) => {
    try {
      await knowledgeApi.updateChunk(chunk.id, { active: !chunk.isActive })
      await load()
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    }
  }

  if (!chunks) return <Skeleton className="h-64 w-full" />
  if (chunks.length === 0) return <p className="py-10 text-center text-[12px] text-muted-foreground">{t('kbdoc.passages.empty')}</p>

  return (
    <div className="space-y-2">
      {failure && <p className="text-[11px] text-destructive">{failure}</p>}
      <div className="border border-border">
        <Table className="table-actions-overlay">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-14">#</TableHead>
              <TableHead>{t('kbdoc.passages.text')}</TableHead>
              <TableHead>{t('kbdoc.passages.status')}</TableHead>
              <TableHead className="text-right">{t('knowledge.corpus.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chunks.map((chunk) => (
              <TableRow key={chunk.id}>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{chunk.chunkIndex + 1}</TableCell>
                <TableCell className="max-w-[520px]">
                  {(chunk.articleNumber || chunk.headingPath) && (
                    <p className="truncate text-[10px] text-muted-foreground">
                      {[chunk.articleNumber && `Article ${chunk.articleNumber}`, chunk.headingPath].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p className="line-clamp-2 text-[12px] text-foreground">{chunk.text}</p>
                </TableCell>
                <TableCell>
                  <Badge tone={chunk.isActive ? 'success' : 'warning'}>
                    {chunk.isActive ? t('kbdoc.passages.active') : t('knowledge.corpus.retired')}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <RowActionMenu
                    overlay
                    inline={
                      <div className="flex items-center justify-end gap-1">
                        <RowActionButton label={t('kbdoc.passages.edit')} onClick={() => setEditing(chunk)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </RowActionButton>
                        <RowActionButton
                          label={chunk.isActive ? t('knowledge.corpus.retire') : t('knowledge.corpus.restore')}
                          tone={chunk.isActive ? 'danger' : 'default'}
                          onClick={() => void toggle(chunk)}
                        >
                          {chunk.isActive ? <X className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        </RowActionButton>
                      </div>
                    }
                  >
                    <TableActionItem icon={Pencil} onClick={() => setEditing(chunk)}>
                      {t('kbdoc.passages.edit')}
                    </TableActionItem>
                    <TableActionItem
                      icon={chunk.isActive ? X : RotateCcw}
                      variant={chunk.isActive ? 'danger' : 'default'}
                      onClick={() => void toggle(chunk)}
                    >
                      {chunk.isActive ? t('knowledge.corpus.retire') : t('knowledge.corpus.restore')}
                    </TableActionItem>
                  </RowActionMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <PassageDialog
        chunk={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null)
          await load()
        }}
      />
    </div>
  )
}

function PassageDialog({ chunk, onClose, onSaved }: { chunk: KbChunkDto | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n()
  const [text, setText] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)

  React.useEffect(() => {
    setText(chunk?.text ?? '')
    setFailure(null)
  }, [chunk])

  const save = async () => {
    if (!chunk) return
    setBusy(true)
    setFailure(null)
    try {
      await knowledgeApi.updateChunk(chunk.id, { text })
      await onSaved()
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={chunk !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden rounded-3xl p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="text-sm font-semibold">{t('kbdoc.passages.edit')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 p-5">
          <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={12} className="font-mono text-[12px]" />
          <p className="text-[10px] text-muted-foreground">{t('kbdoc.passages.reembed')}</p>
          {failure && <p className="text-[11px] text-destructive">{failure}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('kbdoc.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={busy || text.trim().length < 24}>
              {busy ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {t('kbdoc.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MediaGrid({ document, onChanged }: { document: KbDocumentDto; onChanged: () => Promise<void> }) {
  const { t } = useI18n()
  const [editing, setEditing] = React.useState<KbImageDto | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const images = document.images ?? []

  const remove = async (image: KbImageDto) => {
    try {
      await knowledgeApi.deleteImage(image.id)
      await onChanged()
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    }
  }

  return (
    <div className="space-y-4">
      <KbImageUploader filenames={[document.filename]} onUploaded={() => void onChanged()} />
      {failure && <p className="text-[11px] text-destructive">{failure}</p>}
      {images.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-muted-foreground">{t('kbdoc.media.empty')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {images.map((image) => (
            <article key={image.id} className="group relative overflow-hidden rounded-xl border border-border bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assetUrl(image.url)} alt={image.alt ?? image.caption} className="h-32 w-full object-cover" loading="lazy" />
              <div className="space-y-1 p-2">
                <p className="truncate text-[11px] font-medium text-foreground">{image.caption}</p>
                <div className="flex flex-wrap items-center gap-1">
                  {image.dimension && <Badge tone="brand">{READINESS_DIMENSIONS.find((entry) => entry.shortName === image.dimension)?.name ?? image.dimension}</Badge>}
                  {image.source && <Badge>{t(`kbdoc.media.source.${image.source}` as 'kbdoc.media.source.upload')}</Badge>}
                </div>
              </div>
              <div className="absolute right-1.5 top-1.5 flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                <RowActionButton label={t('kbdoc.media.edit')} onClick={() => setEditing(image)}>
                  <Pencil className="h-3.5 w-3.5" />
                </RowActionButton>
                <RowActionButton label={t('kbdoc.media.delete')} tone="danger" onClick={() => void remove(image)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </RowActionButton>
              </div>
            </article>
          ))}
        </div>
      )}
      <ImageDialog
        image={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null)
          await onChanged()
        }}
      />
    </div>
  )
}

function ImageDialog({ image, onClose, onSaved }: { image: KbImageDto | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n()
  const [caption, setCaption] = React.useState('')
  const [alt, setAlt] = React.useState('')
  const [tags, setTags] = React.useState('')
  const [dimension, setDimension] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    setCaption(image?.caption ?? '')
    setAlt(image?.alt ?? '')
    setTags((image?.tags ?? []).join(', '))
    setDimension(image?.dimension ?? '')
  }, [image])

  const save = async () => {
    if (!image) return
    setBusy(true)
    try {
      await knowledgeApi.updateImage(image.id, {
        caption,
        alt,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
        dimension: dimension || null,
      })
      await onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={image !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-3xl p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="text-sm font-semibold">{t('kbdoc.media.edit')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 p-5">
          {image && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={assetUrl(image.url)} alt={image.alt ?? image.caption} className="mx-auto max-h-44 w-auto rounded-lg border border-border bg-white" />
          )}
          <Field label={t('kb.image.caption')}>
            <Input value={caption} onChange={(event) => setCaption(event.target.value)} className="h-8 text-[12px]" />
          </Field>
          <Field label={t('kbdoc.media.alt')}>
            <Input value={alt} onChange={(event) => setAlt(event.target.value)} className="h-8 text-[12px]" />
          </Field>
          <Field label={t('kbdoc.media.tags')}>
            <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="data, standards" className="h-8 text-[12px]" />
          </Field>
          <Field label={t('kb.image.dimension')}>
            <Select
              value={dimension}
              onValueChange={setDimension}
              options={[{ value: '', label: t('kb.image.noDimension') }, ...READINESS_DIMENSIONS.map((entry) => ({ value: entry.shortName, label: entry.name }))]}
              ariaLabel={t('kb.image.dimension')}
              size="md"
              className="w-full"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('kbdoc.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={busy || caption.trim().length === 0}>
              {busy ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {t('kbdoc.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
