import type { Metadata, Viewport } from 'next'
import { Inter, Montserrat } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { ServiceWorkerRegister } from '@/components/service-worker-register'
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
  buildThemePackCss,
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
          <I18nProvider>
            <AuthProvider>{children}</AuthProvider>
          </I18nProvider>
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  )
}
