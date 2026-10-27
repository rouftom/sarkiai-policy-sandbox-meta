import type { Metadata, Viewport } from 'next'
import { Inter, Montserrat } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { I18nProvider } from '@/lib/i18n'
import { AuthProvider } from '@/lib/auth'
import {
  DEFAULT_CORNER_STYLE,
  DEFAULT_THEME_PACK_ID,
  MODE_STORAGE_KEY,
  RADIUS_STORAGE_KEY,
  THEME_PACKS,
  THEME_PACK_STORAGE_KEY,
  buildChromeBootstrapScript,
} from '@sps/theme'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
  weight: ['500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: 'SarkiAI Policy Sandbox',
  description:
    'Policy-grounded multi-agent engine: error-scenario simulation and AI-readiness assessment. Runs on Meta models, or on open weights on-premise.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F9FE' },
    { media: '(prefers-color-scheme: dark)', color: '#050B18' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const bootstrap = buildChromeBootstrapScript({
    themeStorageKey: THEME_PACK_STORAGE_KEY,
    modeStorageKey: MODE_STORAGE_KEY,
    defaultThemeId: DEFAULT_THEME_PACK_ID,
    themes: THEME_PACKS,
    radiusStorageKey: RADIUS_STORAGE_KEY,
    defaultRadius: DEFAULT_CORNER_STYLE,
  })

  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${montserrat.variable}`}>
      <head>
        {/* Pre-paint: apply theme pack + mode before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
      </head>
      <body>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>{children}</AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
