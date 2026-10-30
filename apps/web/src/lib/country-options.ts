import type { CountryDto } from './api'

export interface CountryOption {
  value: string
  label: string
}

/**
 * The country select options every picker shares: the registry rows plus the
 * `global` corpus namespace. `extra` keeps a value that is stored on a record
 * but is no longer in the registry (retired country, legacy corpus).
 */
export function countryOptions(countries: CountryDto[], locale: string, extra?: string): CountryOption[] {
  const options: CountryOption[] = countries.map((country) => ({
    value: country.code,
    label: `${country.code.toUpperCase()} · ${locale === 'fr' ? country.nameFr : country.name}`,
  }))
  if (!options.some((option) => option.value === 'global')) {
    options.push({ value: 'global', label: 'Global' })
  }
  if (extra && !options.some((option) => option.value === extra)) {
    options.push({ value: extra, label: extra.toUpperCase() })
  }
  return options
}
