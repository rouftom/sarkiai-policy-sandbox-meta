/**
 * Phone helpers for the console. Same rules as `@sps/notifications` on the API
 * (E.164 only), without pulling the server package into the browser bundle.
 */

import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js'

export type PhoneInputRejection = 'empty' | 'unparsable' | 'invalid' | 'too_short' | 'too_long'

export type PhoneInputResult =
  | { ok: true; e164: string; national: string; country?: string }
  | { ok: false; reason: PhoneInputRejection }

export interface PhoneCountry {
  /** ISO 3166-1 alpha-2, as libphonenumber expects it. */
  code: CountryCode
  name: string
  dial: string
}

export function parsePhoneInput(raw: string, country = 'CM'): PhoneInputResult {
  const value = String(raw ?? '').trim()
  if (!value) return { ok: false, reason: 'empty' }
  const parsed = parsePhoneNumberFromString(value, country.toUpperCase() as CountryCode)
  if (!parsed) return { ok: false, reason: 'unparsable' }
  const digits = parsed.nationalNumber ?? ''
  if (digits.length < 6) return { ok: false, reason: 'too_short' }
  if (!parsed.isValid()) return { ok: false, reason: 'invalid' }
  return {
    ok: true,
    e164: parsed.number,
    national: parsed.formatNational(),
    ...(parsed.country ? { country: parsed.country } : {}),
  }
}

/**
 * Groups the digits as the operator types, for the country picked in the form.
 * `+33 6 12 34 56 78` keeps its own country; a national number borrows the one
 * selected. The stored value is still parsed again before it leaves the console.
 */
export function formatPhoneAsYouType(raw: string, country = 'CM'): string {
  const value = String(raw ?? '')
  if (!value.trim()) return ''
  return new AsYouType(country.toUpperCase() as CountryCode).input(value)
}

/** Countries with their dialling prefix, named in the active console language. */
export function phoneCountries(locale: string): PhoneCountry[] {
  let display: Intl.DisplayNames | null = null
  try {
    display = new Intl.DisplayNames([locale], { type: 'region' })
  } catch {
    display = null
  }
  return getCountries()
    .map((code) => ({
      code,
      name: display?.of(code) ?? code,
      dial: `+${getCountryCallingCode(code)}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale))
}

/** `+237612345678` → `+237 6 12 34 56 78`, or the raw value when unparsable. */
export function displayPhone(value: string): string {
  const parsed = parsePhoneNumberFromString(String(value ?? ''))
  return parsed ? parsed.formatInternational() : String(value ?? '')
}
