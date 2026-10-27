'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { BrandMark } from '@/components/layout/brand-mark'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/components/theme-provider'
import { useI18n, type Locale } from '@/lib/i18n'
import { WorkspaceProvider } from '@/lib/workspace'

/** Signed-in shell: rail, app bar, then the content panel (same geometry as FSM). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { operator, loading } = useAuth()
  const { setPack, setMode, setRadius } = useTheme()
  const { setLocale } = useI18n()

  React.useEffect(() => {
    if (!loading && !operator) router.replace('/login')
  }, [loading, operator, router])

  // Apply the operator profile once, then let the header controls own the choice.
  React.useEffect(() => {
    if (!operator) return
    const prefs = operator.preferences
    setPack(prefs.pack)
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setMode(prefs.theme === 'system' ? (prefersDark ? 'dark' : 'light') : prefs.theme)
    setLocale(prefs.locale as Locale)
    document.documentElement.dataset.density = prefs.density === 'compact' ? 'dense' : 'comfortable'
    setRadius(prefs.radius)
  }, [operator, setLocale, setMode, setPack, setRadius])

  if (loading || !operator) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <BrandMark className="h-10 w-10 animate-pulse" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            SarkiAI Policy Sandbox
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative isolate flex min-h-dvh w-full overflow-hidden">
      <div className="relative z-10 flex min-h-dvh w-full">
        <WorkspaceProvider>
          <AppSidebar />
          <div className="flex h-dvh flex-1 flex-col overflow-hidden">
            <AppHeader />
            <main className="custom-scrollbar flex-1 overflow-y-auto px-4 pb-10 pt-2 sm:px-6">
              <div className="mx-auto w-full max-w-[1400px]">{children}</div>
            </main>
          </div>
        </WorkspaceProvider>
      </div>
    </div>
  )
}
