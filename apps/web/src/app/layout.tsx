import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { Inter, Montserrat } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { ServiceWorkerRegister } from '@/components/service-worker-register'
import { ToastProvider } from '@/components/shared/toast'
import { I18nProvider, LOCALE_COOKIE, type Locale } from '@/lib/i18n'
import { AuthProvider } from '@/lib/auth'
import {
  DEFAULT_CORNER_STYLE,
  DEFAULT_THEME_PACK_ID,
  MODE_STORAGE_KEY,
  RADIUS_STORAGE_KEY,
  THEME_PACKS,
  THEME_PACK_STORAGE_KEY,
  buildChromeBootstrapScript,
  buildThemePackCss,
} from '@sps/theme'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
  weight: ['500', '600', '700', '800'],
})

/**
 * Canonical origin, from configuration only: the console's own URL when given,
 * otherwise the host's production URL, otherwise local development. Empty
 * values (an unset compose variable, for instance) are ignored, never parsed.
 */
function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

const canonicalUrl =
  firstNonEmpty(
    process.env.NEXT_PUBLIC_WEB_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
  ) ?? `http://localhost:${firstNonEmpty(process.env.NEXT_PUBLIC_WEB_PORT) ?? '3000'}`

export const metadata: Metadata = {
  metadataBase: new URL(canonicalUrl),
  applicationName: 'SPS',
  title: 'SarkiAI Policy Sandbox',
  description:
    'Policy-grounded multi-agent engine: error-scenario simulation and AI-readiness assessment. Runs on Meta models, or on open weights on-premise.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'SPS', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F9FE' },
    { media: '(prefers-color-scheme: dark)', color: '#050B18' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The language the visitor chose is known to the server: the first HTML already carries it.
  const cookieStore = await cookies()
  const lang: Locale = cookieStore.get(LOCALE_COOKIE)?.value === 'fr' ? 'fr' : 'en'
  const bootstrap = buildChromeBootstrapScript({
    themeStorageKey: THEME_PACK_STORAGE_KEY,
    modeStorageKey: MODE_STORAGE_KEY,
    defaultThemeId: DEFAULT_THEME_PACK_ID,
    themes: THEME_PACKS,
    radiusStorageKey: RADIUS_STORAGE_KEY,
    defaultRadius: DEFAULT_CORNER_STYLE,
  })

  return (
    <html lang={lang} suppressHydrationWarning className={`${inter.variable} ${montserrat.variable}`}>
      <head>
        {/*
          Pre-paint: the bootstrap script sets `data-theme-pack` / `.dark` on
          <html>, and the pack CSS is server-rendered here so the very first
          paint · including the unauthenticated screens · already carries the
          operator's theme. The 46 KB of token rules cost less than a flash of
          the default palette.
        */}
        <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
        <style id="sps-theme-packs" dangerouslySetInnerHTML={{ __html: buildThemePackCss(THEME_PACKS) }} />
      </head>
      <body>
        <ThemeProvider>
          <I18nProvider initialLocale={lang}>
            <ToastProvider>
              <AuthProvider>{children}</AuthProvider>
            </ToastProvider>
          </I18nProvider>
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  )
}
