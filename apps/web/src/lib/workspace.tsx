'use client'

/**
 * Demo workspace: the country and domain the operator is working on. Every
 * page reads the same values so moving from the dashboard to a scenario does not
 * silently reset the context. Persisted in `localStorage`.
 */

import * as React from 'react'
import type { Domain } from '@sps/shared'

const STORAGE_KEY = 'sps.workspace'
const DOMAINS: Domain[] = ['health', 'education', 'telecom', 'public_services', 'agriculture']

interface WorkspaceState {
  country: string
  /** The sectors the operator works on (at least one). */
  domains: Domain[]
}

interface WorkspaceContextValue extends WorkspaceState {
  /** The first sector: what the pages that take one sector use. */
  domain: Domain
  setCountry: (country: string) => void
  setDomains: (domains: Domain[]) => void
}

const DEFAULT_WORKSPACE: WorkspaceState = { country: 'cm', domains: ['health'] }

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null)

/** Sectors from the stored value; a single earlier sector becomes a one-item list. */
function domainsFrom(stored: { domains?: unknown; domain?: unknown }): Domain[] {
  const list = Array.isArray(stored.domains) ? stored.domains : typeof stored.domain === 'string' ? [stored.domain] : []
  const valid = DOMAINS.filter((domain) => list.includes(domain))
  return valid.length > 0 ? valid : DEFAULT_WORKSPACE.domains
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<WorkspaceState>(DEFAULT_WORKSPACE)

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const stored = JSON.parse(raw) as { country?: string; domains?: unknown; domain?: unknown }
      // Only Cameroon is offered: an earlier choice of another country falls back to it.
      const country = stored.country === 'cm' ? 'cm' : DEFAULT_WORKSPACE.country
      setState({ country, domains: domainsFrom(stored) })
    } catch {
      /* malformed value: keep the defaults */
    }
  }, [])

  const value = React.useMemo<WorkspaceContextValue>(
    () => ({
      ...state,
      domain: state.domains[0] ?? DEFAULT_WORKSPACE.domains[0]!,
      setCountry: (country) => setState((current) => persist({ ...current, country })),
      setDomains: (domains) =>
        setState((current) => persist({ ...current, domains: domains.length > 0 ? domains : current.domains })),
    }),
    // `setX` closures do not capture state: they are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.country, state.domains],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

function persist(next: WorkspaceState): WorkspaceState {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function useWorkspace(): WorkspaceContextValue {
  const context = React.useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used inside <WorkspaceProvider>.')
  return context
}
