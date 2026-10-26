import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { I18nProvider } from '@/lib/i18n'
import {
  DEFAULT_THEME_PACK_ID,
  MODE_STORAGE_KEY,
  THEME_PACKS,
  THEME_PACK_STORAGE_KEY,
  buildChromeBootstrapScript,
} from '@sps/theme'

export const metadata: Metadata = {
  title: 'SarkiAI Policy Sandbox',
  description:
    'Policy-grounded multi-agent engine: error-scenario simulation and AI-readiness assessment. Runs on Meta models, or on open weights on-premise.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F8FE' },
    { media: '(prefers-color-scheme: dark)', color: '#080A24' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const bootstrap = buildChromeBootstrapScript({
    themeStorageKey: THEME_PACK_STORAGE_KEY,
    modeStorageKey: MODE_STORAGE_KEY,
    defaultThemeId: DEFAULT_THEME_PACK_ID,
    themes: THEME_PACKS,
  })

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Pre-paint: apply theme pack + mode before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
      </head>
      <body>
        <ThemeProvider>
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
