'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Bot } from 'lucide-react'
import { Group, Panel, Separator, type PanelImperativeHandle, type PanelSize } from 'react-resizable-panels'
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@sps/ui'
import { MODE_STORAGE_KEY } from '@sps/theme'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { BrandMark } from '@/components/layout/brand-mark'
import { PolicyAssistant } from '@/components/policy-assistant'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/components/theme-provider'
import { useI18n, type Locale } from '@/lib/i18n'
import { WorkspaceProvider } from '@/lib/workspace'

/**
 * Signed-in shell, same geometry as the FSM admin console: rail + app bar, then
 * a resizable group holding the assistant panel on the left and the page panel
 * on the right (stacked top/bottom under `md`). The assistant is a panel, never
 * an overlay · the operator reads the answer next to the workspace.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { operator, loading } = useAuth()
  const { setPack, setMode, setRadius } = useTheme()
  const { setLocale, t } = useI18n()
  const [isMobile, setIsMobile] = React.useState(false)
  const [assistantOpen, setAssistantOpen] = React.useState(true)
  const panelRef = React.useRef<PanelImperativeHandle>(null)

  React.useEffect(() => {
    if (!loading && !operator) router.replace('/login')
  }, [loading, operator, router])

  // Apply the operator profile once per session, then let the header controls
  // own the choice. Keyed on the e-mail: `operator` changes identity on every
  // saved preference, and re-applying the profile then would undo a switch the
  // operator has just made.
  const profileApplied = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!operator || profileApplied.current === operator.email) return
    profileApplied.current = operator.email
    const prefs = operator.preferences
    setPack(prefs.pack)
    // Light/dark is the one choice an unauthenticated visitor can make (the
    // switch on /login and /signup). If they did, keep it: otherwise signing in
    // would silently undo the theme they just picked. The profile still wins on
    // a browser that never expressed a preference.
    if (!localStorage.getItem(MODE_STORAGE_KEY)) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setMode(prefs.theme === 'system' ? (prefersDark ? 'dark' : 'light') : prefs.theme)
    }
    setLocale(prefs.locale as Locale)
    document.documentElement.dataset.density = prefs.density === 'compact' ? 'dense' : 'comfortable'
    setRadius(prefs.radius)
  }, [operator, setLocale, setMode, setPack, setRadius])

  React.useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) setAssistantOpen(false)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (loading || !operator) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <BrandMark className="h-10 w-10 animate-pulse" />
          <p className="text-[10px] font-medium text-muted-foreground">
            SarkiAI Policy Sandbox
          </p>
        </div>
      </div>
    )
  }

  const openAssistant = () => {
    setAssistantOpen(true)
    panelRef.current?.resize(isMobile ? '50%' : '30%')
  }

  const closeAssistant = () => {
    setAssistantOpen(false)
    panelRef.current?.collapse()
  }

  const assistantPanel = (
    <Panel
      collapsible
      minSize={assistantOpen ? (isMobile ? '40%' : '30%') : '0%'}
      defaultSize={assistantOpen ? (isMobile ? '50%' : '30%') : '0%'}
      panelRef={panelRef}
      onResize={(size: PanelSize) => {
        // The drag gesture is the source of truth: collapsing the panel closes
        // the assistant, pulling it back open mounts it again.
        if (size.asPercentage === 0) {
          if (assistantOpen) setAssistantOpen(false)
        } else if (!assistantOpen) {
          setAssistantOpen(true)
        }
      }}
      className="flex flex-col"
    >
      {assistantOpen && (
        <div
          className={cn(
            'assistant-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl',
            isMobile
              ? 'border-t border-brand-primary/10 dark:border-brand-primary-dark/25'
              : 'border-r border-brand-primary/10 dark:border-brand-primary-dark/25',
          )}
        >
          <PolicyAssistant onClose={closeAssistant} />
        </div>
      )}
    </Panel>
  )

  return (
    <div className="relative isolate flex min-h-dvh w-full overflow-hidden">
      <div className="relative z-10 flex min-h-dvh w-full">
        <WorkspaceProvider>
          <AppSidebar />
          <div className="flex h-dvh flex-1 flex-col overflow-hidden">
            <AppHeader />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-4 pl-4 pr-6 md:pl-0 md:pr-8">
              <Group
                orientation={isMobile ? 'vertical' : 'horizontal'}
                className="relative mt-0 min-h-0 min-w-0 flex-1 overflow-hidden rounded-3xl bg-[var(--app-panel-bg)]"
              >
                {!isMobile && (
                  <>
                    {assistantPanel}
                    <Separator className="z-20 h-[80%] w-1 cursor-col-resize self-center rounded-full bg-brand-primary/10 transition-colors hover:bg-brand-primary/50" />
                  </>
                )}

                <Panel
                  collapsible={false}
                  className="custom-scrollbar h-full min-w-0 flex-1 overflow-hidden rounded-3xl bg-[var(--app-panel-bg)]"
                >
                  <div
                    className={cn(
                      'custom-scrollbar h-full overflow-y-auto overflow-x-hidden p-2 py-2 sm:px-2 sm:pl-3',
                      isMobile && assistantOpen && 'h-full',
                    )}
                  >
                    {!assistantOpen && (
                      <div className="absolute bottom-3 left-2 z-50">
                        <TooltipProvider>

                          <Tooltip>

                            <TooltipTrigger asChild>
                            <Button
                              type="button"
                              onClick={openAssistant}
                              size="icon"
                              variant="ghost"
                              aria-label={t('assistant.open')}
                              className="h-10 w-10 rounded-lg border border-border bg-card text-brand-primary shadow-xl transition-all hover:scale-110 dark:border-brand-primary-dark/30 dark:bg-brand-ink dark:text-brand-primary-light"
                            >
                              <Bot className="h-5 w-5" />
                            </Button>

                            </TooltipTrigger>

                            <TooltipContent side="top">{t('assistant.open')}</TooltipContent>

                          </Tooltip>

                        </TooltipProvider>
                      </div>
                    )}
                    <div className="mx-auto w-full max-w-[1400px]">{children}</div>
                  </div>
                </Panel>

                {isMobile && (
                  <>
                    <Separator className="z-20 h-[3px] w-[80%] cursor-row-resize self-center rounded-full border-none bg-brand-primary/10 transition-colors hover:bg-brand-primary/30" />
                    {assistantPanel}
                  </>
                )}
              </Group>
            </div>
          </div>
        </WorkspaceProvider>
      </div>
    </div>
  )
}
