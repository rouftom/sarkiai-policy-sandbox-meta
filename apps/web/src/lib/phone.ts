/**
 * Phone helpers for the console. Same rules as `@sps/notifications` on the API
 * (E.164 only), without pulling the server package into the browser bundle.
 */

import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'

export type PhoneInputRejection = 'empty' | 'unparsable' | 'invalid' | 'too_short' | 'too_long'

export type PhoneInputResult =
  | { ok: true; e164: string; national: string; country?: string }
  | { ok: false; reason: PhoneInputRejection }

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

/** `+237612345678` → `+237 6 12 34 56 78`, or the raw value when unparsable. */
export function displayPhone(value: string): string {
  const parsed = parsePhoneNumberFromString(String(value ?? ''))
  return parsed ? parsed.formatInternational() : String(value ?? '')
}
