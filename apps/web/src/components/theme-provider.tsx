'use client'

import * as React from 'react'
import {
  DEFAULT_THEME_PACK_ID,
  MODE_STORAGE_KEY,
  THEME_PACKS,
  THEME_PACK_STORAGE_KEY,
  buildThemePackCss,
  getThemePack,
  resolveMode,
  type ThemeMode,
  type ThemePack,
} from '@sps/theme'

interface ThemeContextValue {
  packId: string
  mode: ThemeMode
  packs: ThemePack[]
  setPack: (id: string) => void
  setMode: (mode: ThemeMode) => void
  toggleMode: () => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function applyChrome(pack: ThemePack, mode: ThemeMode) {
  const meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  const color = pack.preview.surface
  if (meta) {
    meta.setAttribute('content', color)
    meta.removeAttribute('media')
  }
  const scheme = document.head.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
  if (scheme) scheme.setAttribute('content', mode)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [packId, setPackId] = React.useState(DEFAULT_THEME_PACK_ID)
  const [mode, setModeState] = React.useState<ThemeMode>('light')

  // Inject the pack CSS once (single source of truth: @sps/theme packs).
  React.useEffect(() => {
    const styleId = 'sps-theme-packs'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = buildThemePackCss(THEME_PACKS)
      document.head.appendChild(style)
    }
    const storedMode = resolveMode(localStorage.getItem(MODE_STORAGE_KEY))
    const storedPack = localStorage.getItem(THEME_PACK_STORAGE_KEY) ?? DEFAULT_THEME_PACK_ID
    setPackId(storedPack)
    setModeState(storedMode)
  }, [])

  const setPack = React.useCallback(
    (id: string) => {
      setPackId(id)
      localStorage.setItem(THEME_PACK_STORAGE_KEY, id)
      document.documentElement.setAttribute('data-theme-pack', getThemePack(id).id)
      applyChrome(getThemePack(id), mode)
    },
    [mode],
  )

  const setMode = React.useCallback(
    (next: ThemeMode) => {
      setModeState(next)
      localStorage.setItem(MODE_STORAGE_KEY, next)
      document.documentElement.classList.toggle('dark', next === 'dark')
      applyChrome(getThemePack(packId), next)
    },
    [packId],
  )

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      packId,
      mode,
      packs: THEME_PACKS,
      setPack,
      setMode,
      toggleMode: () => setMode(mode === 'dark' ? 'light' : 'dark'),
    }),
    [packId, mode, setPack, setMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
