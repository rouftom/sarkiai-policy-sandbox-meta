/**
 * Phone numbers, normalised with libphonenumber-js.
 *
 * The console and the API share the same rule: a contact is stored only as an
 * E.164 number (`+2376…`), so the WhatsApp client never has to guess a country
 * code at send time. Validation reasons are machine codes; the UI translates
 * them, the API returns them verbatim.
 */

import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'

export type PhoneRejection =
  | 'empty'
  | 'unparsable'
  | 'invalid'
  | 'too_short'
  | 'too_long'
  | 'not_mobile'

export interface NormalizedPhone {
  /** `+2376XXXXXXXX`, the only form stored and sent. */
  e164: string
  /** ISO country of the number, as libphonenumber resolves it. */
  country?: string
  /** National form, for display only. */
  national: string
  /** `mobile`, `fixed_line`, `fixed_line_or_mobile`, … */
  kind?: string
}

export type PhoneResult =
  | { ok: true; phone: NormalizedPhone }
  | { ok: false; reason: PhoneRejection }

/** Country used when the operator types a national number without a prefix. */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'CM'

export function normalizePhone(
  raw: string,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY,
): PhoneResult {
  const value = String(raw ?? '').trim()
  if (!value) return { ok: false, reason: 'empty' }

  const parsed = parsePhoneNumberFromString(value, defaultCountry)
  if (!parsed) return { ok: false, reason: 'unparsable' }

  const digits = parsed.nationalNumber ?? ''
  if (digits.length < 6) return { ok: false, reason: 'too_short' }
  if (digits.length > 15) return { ok: false, reason: 'too_long' }
  if (!parsed.isValid()) return { ok: false, reason: 'invalid' }

  const kind = String(parsed.getType() ?? '').toLowerCase()
  if (
    kind === 'pager' ||
    kind === 'uan' ||
    kind === 'voip' ||
    kind === 'premium_rate' ||
    kind === 'shared_cost'
  ) {
    return { ok: false, reason: 'not_mobile' }
  }

  return {
    ok: true,
    phone: {
      e164: parsed.number,
      ...(parsed.country ? { country: parsed.country } : {}),
      national: parsed.formatNational(),
      ...(kind ? { kind } : {}),
    },
  }
}

/** `+237 6 12 34 56 78` → `+237 6•• ••• •78`: safe to show in an audit row. */
export function maskPhone(e164: string): string {
  const value = String(e164 ?? '')
  if (value.length <= 5) return '•'
  const head = value.slice(0, 4)
  const tail = value.slice(-2)
  return `${head} ${'•'.repeat(Math.max(3, value.length - 6))}${tail}`
}

/** `+237612345678` → `+237 6 12 34 56 78`, for display only. */
export function formatPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(String(e164 ?? ''))
  if (!parsed) return String(e164 ?? '')
  return parsed.formatInternational()
}
