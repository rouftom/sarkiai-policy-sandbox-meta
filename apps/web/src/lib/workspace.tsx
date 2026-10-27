'use client'

/**
 * Demo workspace: the country / domain / lens the operator is working on. Every
 * page reads the same values so moving from the dashboard to a scenario does not
 * silently reset the context. Persisted in `localStorage`.
 */

import * as React from 'react'
import type { Domain, WorkflowLens } from '@sps/shared'

const STORAGE_KEY = 'sps.workspace'

interface WorkspaceState {
  country: string
  domain: Domain
  lens: WorkflowLens
}

interface WorkspaceContextValue extends WorkspaceState {
  setCountry: (country: string) => void
  setDomain: (domain: Domain) => void
  setLens: (lens: WorkflowLens) => void
}

const DEFAULT_WORKSPACE: WorkspaceState = { country: 'cm', domain: 'health', lens: 'hybrid' }

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<WorkspaceState>(DEFAULT_WORKSPACE)

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const stored = JSON.parse(raw) as Partial<WorkspaceState>
      setState((current) => ({ ...current, ...stored }))
    } catch {
      /* malformed value: keep the defaults */
    }
  }, [])

  const value = React.useMemo<WorkspaceContextValue>(
    () => ({
      ...state,
      setCountry: (country) => setState((current) => persist({ ...current, country })),
      setDomain: (domain) => setState((current) => persist({ ...current, domain })),
      setLens: (lens) => setState((current) => persist({ ...current, lens })),
    }),
    // `setX` closures do not capture state: they are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.country, state.domain, state.lens],
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
