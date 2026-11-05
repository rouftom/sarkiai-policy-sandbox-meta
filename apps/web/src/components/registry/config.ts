/**
 * The three registry screens (roles, institutions, agents) share one list, one
 * detail page and one editor. This file says what each entity shows and edits.
 */

import type { ComponentType } from 'react'
import { BadgeCheck, Bot, Building2 } from 'lucide-react'
import type { MessageKey } from '@/lib/i18n'
import type { RegistryEntityPath } from '@/lib/api'

export const CAPABILITIES = ['retrieve', 'assess', 'advise', 'coordinate', 'escalate', 'review', 'propose_action', 'score', 'draft'] as const
export const DOMAINS = ['health', 'education', 'telecom', 'public_services', 'agriculture'] as const
export const SCOPES = ['all_events', 'domain_events', 'addressed_events'] as const
export const COLORS = ['text-emerald-500', 'text-sky-500', 'text-indigo-500', 'text-amber-500', 'text-rose-500', 'text-teal-500', 'text-violet-500', 'text-slate-500']

export type FieldKind = 'text' | 'textarea' | 'country' | 'chips' | 'select' | 'lines' | 'legalBasis' | 'boolean'

export interface FieldSpec {
  key: string
  labelKey: MessageKey
  kind: FieldKind
  /** For chips and select: fixed values, or the name of a registry list to load. */
  options?: readonly string[] | 'roles' | 'institutions'
  required?: boolean
  hintKey?: MessageKey
  /** Not editable once created (ids). */
  createOnly?: boolean
}

export interface EntityConfig {
  path: RegistryEntityPath
  icon: ComponentType<{ className?: string }>
  titleKey: MessageKey
  subtitleKey: MessageKey
  newKey: MessageKey
  /** Short secondary line in the list. */
  summary: (record: Record<string, unknown>) => string
  fields: FieldSpec[]
}

const ID: FieldSpec = { key: 'id', labelKey: 'registry.field.id', kind: 'text', required: true, createOnly: true, hintKey: 'registry.hint.id' }
const NAME: FieldSpec = { key: 'name', labelKey: 'registry.field.name', kind: 'text', required: true }

export const ENTITY: Record<RegistryEntityPath, EntityConfig> = {
  roles: {
    path: 'roles',
    icon: BadgeCheck,
    titleKey: 'registry.roles.title',
    subtitleKey: 'registry.roles.subtitle',
    newKey: 'registry.roles.new',
    summary: (r) => (r.capabilities as string[] | undefined)?.join(' · ') ?? '',
    fields: [
      ID,
      NAME,
      { key: 'description', labelKey: 'registry.field.description', kind: 'textarea', required: true },
      { key: 'capabilities', labelKey: 'registry.field.capabilities', kind: 'chips', options: CAPABILITIES, required: true, hintKey: 'registry.hint.capabilities' },
      { key: 'requiresInstitution', labelKey: 'registry.field.requiresInstitution', kind: 'boolean' },
    ],
  },
  institutions: {
    path: 'institutions',
    icon: Building2,
    titleKey: 'registry.institutions.title',
    subtitleKey: 'registry.institutions.subtitle',
    newKey: 'registry.institutions.new',
    summary: (r) => `${String(r.country ?? '')} · ${((r.domains as string[] | undefined) ?? []).join(', ')}`,
    fields: [
      ID,
      NAME,
      { key: 'country', labelKey: 'registry.field.country', kind: 'country', required: true },
      { key: 'mandate', labelKey: 'registry.field.mandate', kind: 'textarea', required: true },
      { key: 'legalBasis', labelKey: 'registry.field.legalBasis', kind: 'legalBasis', hintKey: 'registry.hint.legalBasis' },
      { key: 'domains', labelKey: 'registry.field.domains', kind: 'chips', options: DOMAINS, required: true },
      { key: 'mustNot', labelKey: 'registry.field.mustNot', kind: 'lines', hintKey: 'registry.hint.lines' },
    ],
  },
  agents: {
    path: 'agents',
    icon: Bot,
    titleKey: 'registry.agents.title',
    subtitleKey: 'registry.agents.subtitle',
    newKey: 'registry.agents.new',
    summary: (r) => [r.roleId, r.institutionId].filter(Boolean).join(' · '),
    fields: [
      ID,
      NAME,
      { key: 'roleId', labelKey: 'registry.field.role', kind: 'select', options: 'roles', required: true },
      { key: 'institutionId', labelKey: 'registry.field.institution', kind: 'select', options: 'institutions', hintKey: 'registry.hint.institution' },
      { key: 'model', labelKey: 'registry.field.model', kind: 'text', hintKey: 'registry.hint.model' },
      { key: 'informationScope', labelKey: 'registry.field.scope', kind: 'select', options: SCOPES },
      { key: 'instructions', labelKey: 'registry.field.instructions', kind: 'textarea', hintKey: 'registry.hint.instructions' },
      { key: 'color', labelKey: 'registry.field.color', kind: 'select', options: COLORS },
    ],
  },
}
