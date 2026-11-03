/**
 * Request schemas shared by request validation and the published OpenAPI
 * document. Handlers import these objects directly, so the specification is
 * generated from the same rules the API enforces; there is no second copy to
 * drift.
 */

import { z } from 'zod'
import type { Domain } from '@sps/shared'
import { COUNTRY_SECTORS } from '../countries.js'

/* ── Authentication ──────────────────────────────────────────────────────── */

export const credentials = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
})

export const codeStep = z.object({
  challenge: z.string().min(10).max(4096),
  code: z.string().min(4).max(32),
})

export const setupInput = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email: z.string().email().max(200),
})

export const passwordChange = z.object({
  challenge: z.string().min(10).max(4096),
  password: z.string().min(12).max(200),
})

export const forgotInput = z.object({
  email: z.string().email().max(200),
})

export const resetInput = z.object({
  token: z.string().min(10).max(4096),
  password: z.string().min(12).max(200),
})

export const signupInput = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email: z.string().email().max(200),
  password: z.string().min(12).max(200),
})

export const emailVerifyInput = z.object({ token: z.string().min(10).max(4096) })

export const mfaChallengeInput = z.object({ challenge: z.string().min(10).max(4096) })

export const preferencesPatch = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  pack: z.string().max(40).optional(),
  locale: z.enum(['en', 'fr']).optional(),
  density: z.enum(['comfortable', 'compact']).optional(),
  radius: z.enum(['rounded', 'square']).optional(),
  notifications: z
    .object({ whatsapp: z.boolean(), email: z.boolean(), digest: z.boolean() })
    .partial()
    .optional(),
})

export const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  q: z.string().trim().max(120).optional(),
  stats: z.coerce.number().int().min(1).max(31).optional(),
  tz: z.string().trim().max(64).optional(),
  from: z.string().trim().max(40).optional(),
})

/* ── Models, agents and approvals ────────────────────────────────────────── */

export const modelSelectionInput = z.object({ model: z.string().min(1).max(120) })

export const lensSchema = z.enum(['simulation', 'readiness', 'hybrid'])

export const askBody = z.object({
  institutionId: z.string(),
  question: z.string().min(1),
  country: z.string().length(2),
  domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']),
  lens: lensSchema.default('hybrid'),
  /** The language of the answer: the console's. */
  language: z.enum(['fr', 'en']).default('en'),
  runId: z.string().optional(),
  /** Reasoning effort chosen in the console; absent lets the provider decide. */
  effort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
  // Untrusted user files (context only, never citable): images, or documents read as reference text.
  attachments: z
    .array(z.object({ mime: z.string(), dataBase64: z.string(), name: z.string().max(200).optional() }))
    .max(3)
    .optional(),
})

export const agentRoutingRequest = z.object({
  question: z.string().min(3).max(2000),
  domains: z
    .array(z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']))
    .min(1)
    .max(5),
  /** Chosen institutions: the router picks among them only. Empty or absent: every institution of the sectors. */
  institutionIds: z.array(z.string().max(80)).max(10).optional(),
})

export const searchInput = z.object({
  text: z.string().min(2).max(2000),
  country: z.string().min(2).max(2).or(z.literal('global')).or(z.literal('')).default(''),
  jurisdiction: z.enum(['national', 'regional', 'international']).optional(),
  docType: z.string().optional(),
  namespace: z.string().optional(),
  topK: z.number().int().min(1).max(12).default(6),
  depth: z.enum(['lexical', 'fast', 'deep']).default('deep'),
})

export const approvalTokenParams = z.object({ token: z.string().min(1).max(4096) })

export const approvalDecisionInput = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().max(1000).optional(),
})

/* ── Country registry ────────────────────────────────────────────────────── */

export const countryCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2}$/)

export const countrySectorsSchema = z
  .enum(COUNTRY_SECTORS as unknown as [Domain, ...Domain[]])
  .array()
  .min(1)
  .max(COUNTRY_SECTORS.length)

export const countryBodySchema = z.object({
  code: countryCodeSchema,
  name: z.string().trim().min(2).max(80),
  nameFr: z.string().trim().min(2).max(80).optional(),
  jurisdiction: z.enum(['national', 'regional', 'international']).optional(),
  region: z.string().trim().max(80).optional(),
  authority: z.string().trim().max(120).optional(),
  currency: z.string().trim().max(8).optional(),
  languages: z.array(z.string().trim().min(2).max(8)).max(6).optional(),
  timezone: z.string().trim().max(60).optional(),
  status: z.enum(['active', 'planned']).optional(),
  notes: z.string().trim().max(600).optional(),
  sectors: countrySectorsSchema.optional(),
})

export const countryPatchSchema = countryBodySchema.omit({ code: true }).partial()

export const countrySectorsInput = z.object({ sectors: countrySectorsSchema })

export const countryCodeParams = z.object({ code: countryCodeSchema })

/* ── Notifications --------------------------------------------------------- */

export const whatsappMessageInput = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(50),
  kind: z.enum(['test', 'joint_report', 'deadline_alert', 'approval_request']),
  runId: z.string().min(1).max(120).optional(),
  tick: z.number().int().min(0).optional(),
  summary: z.string().min(1).max(900).optional(),
  title: z.string().min(1).max(200).optional(),
  deadline: z.string().min(1).max(120).optional(),
  actionUrl: z.string().url().optional(),
  expiresInMinutes: z.number().int().min(5).max(10_080).optional(),
})

export const emailMessageInput = z
  .object({
    contactIds: z.array(z.string().min(1)).min(1).max(50),
    subject: z.string().trim().min(1).max(160),
    heading: z.string().trim().min(1).max(160).optional(),
    intro: z.string().trim().max(300).optional(),
    message: z.string().trim().min(1).max(5_000),
    ctaLabel: z.string().trim().min(1).max(60).optional(),
    ctaUrl: z.string().url().max(2_000).optional(),
    locale: z.enum(['fr', 'en']).optional(),
  })
  .refine((value) => Boolean(value.ctaLabel) === Boolean(value.ctaUrl), {
    message: 'cta_incomplete',
    path: ['ctaUrl'],
  })

/* ── Responses worth publishing ──────────────────────────────────────────── */

export const healthResponse = z.object({
  status: z.literal('ok'),
  service: z.literal('sps-api'),
  provider: z.object({ mode: z.string(), model: z.string() }),
})
