'use client'

/**
 * Demo workspace: the country and sectors the operator is working on. Every
 * page reads the same values so moving from the dashboard to a scenario does not
 * silently reset the context. The country list comes from the registry API
 * (`/v1/countries`), so adding a jurisdiction is a data change, not a code one.
 * Persisted in `localStorage`.
 */

import * as React from 'react'
import type { Domain } from '@sps/shared'
import { countriesApi, type CountryDto } from './api'

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
  /** The registry rows, empty until the API answers. */
  countries: CountryDto[]
  /** Sectors enabled for the current country (all of them before the list loads). */
  sectors: Domain[]
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
  const [countries, setCountries] = React.useState<CountryDto[]>([])

  React.useEffect(() => {
    let cancelled = false
    void countriesApi
      .list()
      .then((result) => !cancelled && setCountries(result.countries))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const stored = JSON.parse(raw) as { country?: unknown; domains?: unknown; domain?: unknown }
      const country =
        typeof stored.country === 'string' && /^[a-z]{2}$/.test(stored.country)
          ? stored.country
          : DEFAULT_WORKSPACE.country
      setState({ country, domains: domainsFrom(stored) })
    } catch {
      /* malformed value: keep the defaults */
    }
  }, [])

  /** A stored country removed or not active falls back to the first active one. */
  React.useEffect(() => {
    if (countries.length === 0) return
    const active = countries.filter((row) => row.status === 'active')
    const available = active.length > 0 ? active : countries
    if (available.some((row) => row.code === state.country)) return
    setState((current) => persist({ ...current, country: active[0]?.code ?? available[0]!.code }))
  }, [countries, state.country])

  const sectors = React.useMemo<Domain[]>(() => {
    const current = countries.find((row) => row.code === state.country)
    return current?.sectors?.length ? current.sectors : DOMAINS
  }, [countries, state.country])

  /** Keep the selection inside the sectors the current country enables. */
  React.useEffect(() => {
    setState((current) => {
      const allowed = current.domains.filter((domain) => sectors.includes(domain))
      if (allowed.length === current.domains.length) return current
      return persist({ ...current, domains: allowed.length > 0 ? allowed : [sectors[0] ?? DEFAULT_WORKSPACE.domains[0]!] })
    })
  }, [sectors])

  const value = React.useMemo<WorkspaceContextValue>(
    () => ({
      ...state,
      domain: state.domains[0] ?? DEFAULT_WORKSPACE.domains[0]!,
      countries,
      sectors,
      setCountry: (country) => setState((current) => persist({ ...current, country })),
      setDomains: (domains) =>
        setState((current) => persist({ ...current, domains: domains.length > 0 ? domains : current.domains })),
    }),
    // `setX` closures do not capture state: they are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.country, state.domains, countries, sectors],
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
