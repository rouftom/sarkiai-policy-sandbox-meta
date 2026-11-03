/**
 * Human-written metadata for the operations worth documenting in detail.
 *
 * Everything else is still published: the catalog records every Fastify route
 * and the builder derives its method, path, tag and security. Only the summary,
 * the request schemas and the response schema come from here, so adding an
 * endpoint never hides it from the document.
 */

import type { ZodType } from 'zod'
import {
  agentRoutingRequest,
  approvalDecisionInput,
  approvalTokenParams,
  askBody,
  auditQuery,
  codeStep,
  countryBodySchema,
  countryCodeParams,
  countryPatchSchema,
  countrySectorsInput,
  credentials,
  emailMessageInput,
  emailVerifyInput,
  forgotInput,
  healthResponse,
  mfaChallengeInput,
  modelSelectionInput,
  passwordChange,
  preferencesPatch,
  resetInput,
  searchInput,
  setupInput,
  signupInput,
  whatsappMessageInput,
} from './schemas.js'

export interface OperationDoc {
  summary: string
  description?: string
  tags?: string[]
  body?: ZodType
  query?: ZodType
  params?: ZodType
  response?: ZodType
  /** Response media type, when it is not `application/json`. */
  responseType?: string
}

export interface DiscoveredRoute {
  method: string
  path: string
}

export const OPERATIONS: Record<string, OperationDoc> = {
  /* ── System ────────────────────────────────────────────────────────────── */
  'GET /health': {
    summary: 'Service health and active provider',
    tags: ['system'],
    response: healthResponse,
  },
  'GET /v1/provider': {
    summary: 'Active model provider',
    description: 'Secret-free description of the provider mode and models currently in use.',
    tags: ['system'],
  },

  'GET /openapi.json': {
    summary: 'This OpenAPI document',
    tags: ['system'],
  },
  'GET /docs': {
    summary: 'Interactive API reference',
    tags: ['system'],
  },

  /* ── Authentication ────────────────────────────────────────────────────── */
  'GET /v1/auth/setup': {
    summary: 'Whether the deployment still needs its root operator',
    tags: ['auth'],
  },
  'POST /v1/auth/setup': {
    summary: 'Create the root operator (once)',
    description: 'Refused once an operator exists. The generated password is mailed, or returned once on a local install without mail.',
    tags: ['auth'],
    body: setupInput,
  },
  'GET /v1/auth/captcha': {
    summary: 'Turnstile configuration for the console',
    tags: ['auth'],
  },
  'POST /v1/auth/signup': {
    summary: 'Create an operator account (cloud demo only)',
    tags: ['auth'],
    body: signupInput,
  },
  'POST /v1/auth/login': {
    summary: 'Sign in',
    description: 'Returns a session, or a challenge when e-mail verification, a password change or TOTP enrolment is still required.',
    tags: ['auth'],
    body: credentials,
  },
  'POST /v1/auth/password': {
    summary: 'Replace a password from a challenge',
    tags: ['auth'],
    body: passwordChange,
  },
  'POST /v1/auth/password/forgot': {
    summary: 'Request a password-reset link',
    tags: ['auth'],
    body: forgotInput,
  },
  'POST /v1/auth/password/reset': {
    summary: 'Reset a password with a signed link',
    tags: ['auth'],
    body: resetInput,
  },
  'POST /v1/auth/email/verify': {
    summary: 'Confirm an e-mail address',
    tags: ['auth'],
    body: emailVerifyInput,
  },
  'POST /v1/auth/email/resend': {
    summary: 'Resend the confirmation e-mail',
    tags: ['auth'],
    body: forgotInput,
  },
  'POST /v1/auth/mfa/enroll': {
    summary: 'Start TOTP enrolment',
    tags: ['auth'],
    body: mfaChallengeInput,
  },
  'POST /v1/auth/mfa/confirm': {
    summary: 'Confirm TOTP enrolment and open a session',
    tags: ['auth'],
    body: codeStep,
  },
  'POST /v1/auth/mfa/verify': {
    summary: 'Second factor for an enrolled operator',
    tags: ['auth'],
    body: codeStep,
  },
  'GET /v1/auth/me': {
    summary: 'Current operator',
    tags: ['auth'],
  },
  'POST /v1/auth/logout': {
    summary: 'Record a sign-out',
    description: 'Sessions are stateless; the client drops its token.',
    tags: ['auth'],
  },
  'GET /v1/preferences': {
    summary: 'Operator preferences',
    tags: ['auth'],
  },
  'PUT /v1/preferences': {
    summary: 'Update operator preferences',
    tags: ['auth'],
    body: preferencesPatch,
  },
  'GET /v1/audit/events': {
    summary: 'Audit feed for the signed-in operator',
    tags: ['audit'],
    query: auditQuery,
  },

  /* ── Models ────────────────────────────────────────────────────────────── */
  'GET /v1/models': {
    summary: 'Models available to this key',
    description: 'Meta Model API catalog. In local or sovereign mode the list is empty.',
    tags: ['models'],
  },
  'PUT /v1/models/selection': {
    summary: 'Select a model for the operator',
    description: 'The choice is saved per operator; the shared engine applies one model at a time.',
    tags: ['models'],
    body: modelSelectionInput,
  },

  /* ── Agents ────────────────────────────────────────────────────────────── */
  'POST /v1/agents/ask': {
    summary: 'Ask the mandated agents a question',
    description: 'Runs the institutional agents for one domain and returns their assessment with citations.',
    tags: ['agents'],
    body: askBody,
  },
  'POST /v1/agents/ask/stream': {
    summary: 'Ask the agents and stream the answer',
    description: 'Same input and validation as `/v1/agents/ask`; the answer arrives as server-sent events.',
    tags: ['agents'],
    body: askBody,
    responseType: 'text/event-stream',
  },
  'POST /v1/agents/route': {
    summary: 'Route a question to the relevant agents',
    description: 'Chooses one to three institutions from the selected sectors, or only among the given ids.',
    tags: ['agents'],
    body: agentRoutingRequest,
  },

  /* ── Country registry ──────────────────────────────────────────────────── */
  'GET /v1/countries': {
    summary: 'List countries',
    tags: ['countries'],
  },
  'POST /v1/countries': {
    summary: 'Add a country (administrator)',
    tags: ['countries'],
    body: countryBodySchema,
  },
  'GET /v1/countries/:code': {
    summary: 'Read one country',
    tags: ['countries'],
    params: countryCodeParams,
  },
  'PATCH /v1/countries/:code': {
    summary: 'Update a country (administrator)',
    tags: ['countries'],
    params: countryCodeParams,
    body: countryPatchSchema,
  },
  'DELETE /v1/countries/:code': {
    summary: 'Delete a country (administrator)',
    tags: ['countries'],
    params: countryCodeParams,
  },
  'PUT /v1/countries/:code/sectors': {
    summary: 'Replace the sectors enabled for a country (administrator)',
    tags: ['countries'],
    params: countryCodeParams,
    body: countrySectorsInput,
  },

  /* ── WhatsApp ──────────────────────────────────────────────────────────── */
  'GET /v1/whatsapp/webhook': {
    summary: 'Meta webhook verification challenge',
    tags: ['whatsapp'],
  },
  'POST /v1/whatsapp/webhook': {
    summary: 'Inbound WhatsApp events',
    description: 'Signed with `x-hub-signature-256`; a cloud deployment refuses unsigned events.',
    tags: ['whatsapp'],
  },
  'GET /v1/whatsapp/approvals/:token': {
    summary: 'Read a signed approval request',
    tags: ['whatsapp'],
    params: approvalTokenParams,
  },
  'POST /v1/whatsapp/approvals/:token': {
    summary: 'Decide a signed approval request',
    description: 'Single-use: a second decision on the same link answers 409.',
    tags: ['whatsapp'],
    params: approvalTokenParams,
    body: approvalDecisionInput,
  },

  /* ── Knowledge base ────────────────────────────────────────────────────── */
  'GET /v1/kb/status': {
    summary: 'Corpus and index status',
    tags: ['knowledge'],
  },
  'GET /v1/kb/documents': {
    summary: 'List corpus documents',
    tags: ['knowledge'],
  },
  'POST /v1/kb/ingest/text': {
    summary: 'Ingest a text document (administrator)',
    tags: ['knowledge'],
  },
  'POST /v1/kb/search': {
    summary: 'Search the corpus',
    tags: ['knowledge'],
    body: searchInput,
  },

  /* ── Readiness, scenarios and exercises ────────────────────────────────── */
  'POST /v1/readiness/stream': {
    summary: 'Run a readiness assessment and stream it',
    tags: ['readiness'],
    responseType: 'text/event-stream',
  },
  'POST /v1/readiness/report': {
    summary: 'Build a readiness report',
    tags: ['readiness'],
  },
  'POST /v1/scenarios/start': {
    summary: 'Open a facilitator session',
    tags: ['scenarios'],
  },
  'POST /v1/scenarios/:runId/next': {
    summary: 'Release the next scenario tick',
    tags: ['scenarios'],
  },
  'POST /v1/exercise/evaluate': {
    summary: 'Evaluate an exercise',
    tags: ['scenarios'],
  },

  /* ── Notifications ─────────────────────────────────────────────────────── */
  'GET /v1/notifications/contacts': {
    summary: 'List notification contacts (administrator)',
    tags: ['notifications'],
  },
  'POST /v1/notifications/whatsapp': {
    summary: 'Send a WhatsApp notification (administrator)',
    tags: ['notifications'],
    body: whatsappMessageInput,
  },
  'POST /v1/notifications/email': {
    summary: 'Send an email notification (administrator)',
    tags: ['notifications'],
    body: emailMessageInput,
  },

  /* ── Voice ─────────────────────────────────────────────────────────────── */
  'POST /v1/voice/transcribe': {
    summary: 'Transcribe audio with Muse Voice Transcribe',
    tags: ['voice'],
  },
  'GET /v1/voice/realtime': {
    summary: 'Realtime voice transcription socket',
    description: 'Authenticated with `?token=`; the relay keeps the model key server-side.',
    tags: ['voice'],
  },
}

export const TAG_DESCRIPTIONS: Record<string, string> = {
  system: 'Health, provider and the reference itself.',
  auth: 'Sign-in, second factor and operator preferences.',
  audit: 'Audit chain and per-operator event feed.',
  models: 'Meta Model API catalog and selection.',
  agents: 'Mandated institutional agents and their coordinator.',
  countries: 'Jurisdiction and sector registry.',
  whatsapp: 'Meta webhook and signed approval links.',
  knowledge: 'Legal corpus, ingestion and search.',
  readiness: 'Readiness assessments and reports.',
  scenarios: 'Crisis scenarios and exercises.',
  exercise: 'Exercise evaluation and after-action reports.',
  notifications: 'Outbound WhatsApp and e-mail messages.',
  voice: 'Speech transcription.',
  gazette: 'Official gazette analysis and ingestion.',
  impact: 'Policy impact analysis.',
  actions: 'Operator decisions on proposed actions.',
  chat: 'Conversation history.',
  observability: 'Usage, budget and request traces.',
}

export function operationFor(method: string, path: string): OperationDoc | undefined {
  return OPERATIONS[`${method.toUpperCase()} ${path}`]
}

/** First meaningful segment of the path, for operations without a tag. */
export function tagFor(path: string): string {
  const segments = path.split('/').filter(Boolean)
  const segment = segments[0] === 'v1' ? segments[1] ?? 'system' : segments[0] ?? 'system'
  // The knowledge-base routes use `/v1/kb`, the group is named `knowledge`.
  return segment === 'kb' ? 'knowledge' : segment
}
