'use client'

import * as React from 'react'
import Turnstile from 'react-turnstile'
import { authApi, type CaptchaConfigDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

/** Actions Cloudflare signs into the token; the API expects the same value. */
export type TurnstileAction = 'signup' | 'password_reset'

export interface TurnstileCheck {
  /** The public widget key, served by `GET /v1/auth/captcha`. */
  siteKey: string | null
  /** The widget must produce a token before the form may submit. */
  required: boolean
  /** The API has not answered yet: keep the submit disabled, do not jump the gun. */
  loading: boolean
  token: string | null
  setToken: (token: string | null) => void
  /** Drop the token and rebuild the widget (used after `captcha_failed`). */
  reset: () => void
  /** Bumped on every reset so the widget remounts with a fresh challenge. */
  generation: number
}

/**
 * Reads the API's captcha policy once per screen.
 *
 * The API owns the decision: cloud and sovereign deployments with keys return
 * `required: true`, local installs (or a deployment without keys) return
 * `required: false` and the forms render no widget. A failed lookup is treated
 * as "no widget": the API still verifies the request, so the form never breaks
 * because this endpoint was slow.
 */
export function useTurnstileCheck(): TurnstileCheck {
  const [config, setConfig] = React.useState<CaptchaConfigDto | null>(null)
  const [token, setToken] = React.useState<string | null>(null)
  const [generation, setGeneration] = React.useState(0)

  React.useEffect(() => {
    let active = true
    authApi
      .captcha()
      .then((next) => {
        if (active) setConfig(next)
      })
      .catch(() => {
        if (active) setConfig({ required: false, siteKey: null })
      })
    return () => {
      active = false
    }
  }, [])

  const reset = React.useCallback(() => {
    setToken(null)
    setGeneration((value) => value + 1)
  }, [])

  return {
    siteKey: config?.siteKey ?? null,
    required: Boolean(config?.required && config.siteKey),
    loading: config === null,
    token,
    setToken,
    reset,
    generation,
  }
}

/** The widget itself, hidden until the API asks for it. */
export function TurnstileWidget({ check, action }: { check: TurnstileCheck; action: TurnstileAction }) {
  const { t, locale } = useI18n()
  const [failed, setFailed] = React.useState(false)
  if (!check.required || !check.siteKey) return null

  const fail = () => {
    check.setToken(null)
    setFailed(true)
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Turnstile
        key={check.generation}
        sitekey={check.siteKey}
        theme="auto"
        language={locale === 'fr' ? 'fr' : 'en'}
        action={action}
        onVerify={(token) => {
          setFailed(false)
          check.setToken(token)
        }}
        onExpire={() => check.setToken(null)}
        onTimeout={fail}
        onError={fail}
      />
      {/* Without this line a blocked widget looks like a dead button. */}
      {failed && <p className="text-left text-[10px] text-destructive">{t('turnstile.unavailable')}</p>}
    </div>
  )
}
