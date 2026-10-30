'use client'

/**
 * The after-action report as the console shows it. The sections come from the
 * same model as the Markdown, HTML and PDF exports, so what is read on screen
 * is what is filed.
 */

import * as React from 'react'
import { FileCode, FileDown, FileText } from 'lucide-react'
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@sps/ui'
import type { AfterActionDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { ICON_BUTTON_OUTLINE } from '@/components/icon-button-styles'
import {
  buildReportModel,
  downloadText,
  imageSource,
  printReport,
  reportFilename,
  toHtml,
  toMarkdown,
} from '@/lib/after-action-export'

export function ExerciseReport({ report }: { report: AfterActionDto | null }) {
  const { t } = useI18n()

  if (!report) {
    return <p className="text-sm text-muted-foreground">{t('exercise.report.empty')}</p>
  }

  const model = buildReportModel(report, t)

  const exports = [
    {
      id: 'markdown',
      label: t('exercise.export.markdown'),
      icon: FileText,
      run: () => downloadText(toMarkdown(report, t), reportFilename(report, 'md'), 'text/markdown'),
    },
    {
      id: 'html',
      label: t('exercise.export.html'),
      icon: FileCode,
      run: () => downloadText(toHtml(report, t), reportFilename(report, 'html'), 'text/html'),
    },
    {
      id: 'pdf',
      label: t('exercise.export.pdf'),
      icon: FileDown,
      run: () => printReport(toHtml(report, t)),
    },
  ]

  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className="text-base font-semibold leading-snug">{model.title}</h3>
          <p className="text-[11px] text-muted-foreground">{model.subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label={t('exercise.export.title')}>
          {exports.map((item) => {
            const Icon = item.icon
            return (
              <TooltipProvider key={item.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={item.label}
                      className={ICON_BUTTON_OUTLINE}
                      onClick={item.run}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="border-border bg-card text-[11px] font-medium text-foreground shadow-md">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          })}
        </div>
      </header>

      {model.cover && (
        <figure className="space-y-1">
          <img src={imageSource(model.cover)} alt={model.cover.caption} className="w-full rounded-xl border border-border" />
          <figcaption className="text-[10px] text-muted-foreground">{model.cover.caption}</figcaption>
        </figure>
      )}

      {model.sections.map((section) => (
        <section key={section.heading} className="space-y-2">
          <h4 className="border-l-4 border-primary pl-2.5 text-[13px] font-semibold dark:border-primary">{section.heading}</h4>

          {section.paragraphs
            .filter((paragraph) => paragraph.trim() !== '')
            .map((paragraph, index) => (
              <p key={index} className="text-xs leading-relaxed">
                {paragraph}
              </p>
            ))}

          {section.table && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[28rem] text-[11px]">
                <thead className="bg-secondary/60 text-left text-muted-foreground">
                  <tr>
                    {section.table.head.map((head) => (
                      <th key={head} className="px-2 py-1.5 font-medium">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.table.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t border-border/60">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className={cn('px-2 py-1.5 align-top', cellIndex === 0 && 'font-medium')}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {section.image && (
            <figure className="space-y-1">
              <img src={imageSource(section.image)} alt={section.image.caption} className="w-full rounded-xl border border-border" />
              <figcaption className="text-[10px] text-muted-foreground">{section.image.caption}</figcaption>
            </figure>
          )}

          {section.bullets.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed marker:text-primary">
              {section.bullets.map((bullet, index) => {
                const lead = section.bulletLead?.[index]
                return (
                  <li key={index}>
                    {lead && <strong className="font-semibold">{lead}: </strong>}
                    {bullet}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}

      <p className="border-t border-border pt-2 text-[10px] text-muted-foreground">{model.footer}</p>
    </article>
  )
}
