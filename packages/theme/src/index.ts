/**
 * @sps/theme — the SarkiAI admin charter (apps/organization) replicated for the
 * Policy Sandbox. Theme packs: fada (default), green, ocean, sunset, mono.
 */

import fada from './packs/fada.json'
import green from './packs/green.json'
import ocean from './packs/ocean.json'
import sunset from './packs/sunset.json'
import mono from './packs/mono.json'
import type { ThemePack } from './types'

const rawPacks: ThemePack[] = [fada, green, ocean, sunset, mono] as ThemePack[]

export const THEME_PACKS: ThemePack[] = rawPacks

const defaultPack = THEME_PACKS.find((pack) => pack.isDefault) ?? THEME_PACKS[0]!
export const DEFAULT_THEME_PACK_ID = defaultPack.id
export const THEME_PACK_IDS = THEME_PACKS.map((pack) => pack.id)

export function getThemePack(id?: string | null): ThemePack {
  return (id && THEME_PACKS.find((pack) => pack.id === id)) || defaultPack
}

export function isThemePackId(id?: string | null): boolean {
  return !!id && THEME_PACK_IDS.includes(id)
}

export const THEME_PACK_STORAGE_KEY = 'sps-theme-pack'
export const MODE_STORAGE_KEY = 'sps-theme-mode'

export * from './types'
export * from './generate-css'
export * from './chrome'
