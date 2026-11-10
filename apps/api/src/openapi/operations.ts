/**
 * Human-written metadata for every operation the API publishes.
 *
 * The catalog records every Fastify route and the builder derives its method,
 * path, tag and security from it, so an endpoint can never disappear from the
 * document. This file adds what the code cannot infer: a summary in plain
 * English, the reason the operation exists, the zod schema it validates with,
 * the statuses it can actually answer with, and a request example a reader can
 * run unchanged.
 *
 * `errors` is what the handler sends, not what it might send: a route that
 * answers 409 on a completed run says so, and a route that never validates a
 * body does not pretend to publish a 400.
 */

import { z } from 'zod'
import { agentCreateSchema, agentPatchSchema, agentSpecsQuery, institutionCreateSchema, institutionPatchSchema, registryIdParams, roleCreateSchema, rolePatchSchema, statusSchema } from '../registry-routes.js'
import type { ZodType } from 'zod'
import {
  actionDecisionInput,
  agentRoutingRequest,
  approvalDecisionInput,
  approvalTokenParams,
  askBody,
  auditDossierQuery,
  auditQuery,
  chatSessionInput,
  codeStep,
  countryBodySchema,
  countryCodeParams,
  countryPatchSchema,
  countrySectorsInput,
  credentials,
  emailMessageInput,
  emailVerifyInput,
  exerciseBodyInput,
  exerciseReportsQuery,
  exerciseSampleQuery,
  forgotInput,
  gazetteAnalyzeInput,
  gazetteIngestInput,
  healthResponse,
  impactAnalyzeInput,
  ingestResponse,
  kbChunkPatch,
  kbDocumentActiveInput,
  kbDocumentImagesInput,
  kbDocumentListQuery,
  kbDocumentPatch,
  kbDocumentPreviewQuery,
  kbDocumentQuery,
  kbImagePatch,
  kbIngestAliasBody,
  kbIngestFileBody,
  kbIngestTextBody,
  mfaChallengeInput,
  modelSelectionInput,
  notificationContactInput,
  notifyInput,
  observabilityEventsQuery,
  passwordChange,
  preferencesPatch,
  readinessAssessInput,
  readinessLocalizeInput,
  readinessReportInput,
  readinessRunsQuery,
  readinessStreamInput,
  readinessWhatIfInput,
  resetInput,
  scenarioExportQuery,
  scenarioReleaseQuery,
  scenarioRunInput,
  scenarioRunParams,
  searchInput,
  setupInput,
  signupInput,
  summarySuggestionInput,
  usageQuery,
  voiceCorrectBody,
  whatsappMessageInput,
} from './schemas.js'

/** One failure the handler can answer with, and why. */
export interface OperationError {
  status: number
  description: string
}

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
  /** Success status code. `200` unless the handler answers `201`. */
  status?: number
  /**
   * Failures specific to this operation. The shared 401 (missing session) and
   * 429 (rate limit, work gate) are added by the builder.
   */
  errors?: OperationError[]
  /** Body sent in the published example. Must validate against `body`. */
  example?: Record<string, unknown>
}

/** Shorthand so the tables below stay readable. */
const error = (status: number, description: string): OperationError => ({ status, description })

/** Documentation-only path parameter: Fastify validates the shape of the route, not the value. */
const pathParam = (name: string, description: string): ZodType =>
  z.object({ [name]: z.string().min(1).describe(description) })

const BAD_REQUEST = error(
  400,
  'The body, query or path does not match its schema. Answered with `error: "validation_failed"` and the offending `fields`.',
)
const NOT_FOUND = error(404, 'The record does not exist, or does not belong to the signed-in operator.')
const CONFLICT = error(409, 'The request conflicts with the current state of the record.')
const PAYLOAD_TOO_LARGE = error(413, 'The payload exceeds the size the route accepts.')
const UNPROCESSABLE = error(422, 'The request is well-formed but the server refuses its content.')
const BAD_GATEWAY = error(502, 'An upstream dependency — model provider, storage or renderer — failed.')
const SERVICE_UNAVAILABLE = error(503, 'The feature is not configured on this deployment.')
const FORBIDDEN = error(403, 'The operator is not an administrator, or the document rights forbid the operation.')
const INTERNAL = error(500, 'The operation failed after validation; the reason is logged server-side.')

/** Shared by the two exercise routes, which validate the same body. */
const EXERCISE_EXAMPLE: Record<string, unknown> = {
  definition: {
    id: 'ex-data-breach-2025',
    title: 'Fuite de données dans un hôpital régional',
    country: 'cm',
    domain: 'health',
    durationMinutes: 90,
    injects: [
      {
        id: 'inject-1',
        atMinute: 0,
        title: 'Alerte de fuite',
        detail: 'Un prestataire signale une fuite de données de patients.',
        visibleTo: ['minsante'],
        expectedAction: 'Qualifier la violation et informer l’autorité de contrôle.',
      },
    ],
  },
  actions: [
    {
      atMinute: 12,
      actor: 'minsante',
      kind: 'decision',
      text: 'Le comité de crise est activé et la violation est qualifiée.',
      injectId: 'inject-1',
    },
  ],
  evaluatedAtMinute: 60,
  lang: 'fr',
}

export interface DiscoveredRoute {
  method: string
  path: string
}

export const OPERATIONS: Record<string, OperationDoc> = {
  /* ── System ────────────────────────────────────────────────────────────── */
  'GET /health': {
    summary: 'Service health and active provider',
    description:
      'Liveness probe used by the deployment platform. Public, unauthenticated, and cheap: it reads no store.',
    tags: ['system'],
    response: healthResponse,
  },
  'GET /v1/provider': {
    summary: 'Active model provider',
    description:
      'Secret-free description of the provider mode and the models currently in use. The console shows it on the status strip; it never contains a key or an endpoint credential.',
    tags: ['system'],
  },
  'GET /openapi.json': {
    summary: 'This OpenAPI document',
    description: 'OpenAPI 3.1 document generated from the routes Fastify registered. Public and uncached.',
    tags: ['system'],
  },

  /* ── Authentication ────────────────────────────────────────────────────── */
  'GET /v1/auth/setup': {
    summary: 'Whether the deployment still needs its root operator',
    description: 'The console uses it to decide between the setup wizard and the sign-in form.',
    tags: ['auth'],
  },
  'POST /v1/auth/setup': {
    summary: 'Create the root operator (once)',
    description:
      'Refused once an operator exists. The generated password is mailed; on a local install without mail it is returned once in the response.',
    tags: ['auth'],
    body: setupInput,
    status: 201,
    errors: [BAD_REQUEST, CONFLICT],
    example: { firstName: 'Amina', lastName: 'Njoya', email: 'amina.njoya@example.cm' },
  },
  'GET /v1/auth/captcha': {
    summary: 'Turnstile configuration for the console',
    description: 'Returns the public site key, or an empty object when bot verification is disabled.',
    tags: ['auth'],
  },
  'POST /v1/auth/signup': {
    summary: 'Create an operator account (cloud demo only)',
    description:
      'Only a deployment that runs in demo mode accepts a sign-up; a production install answers 403 and expects an administrator to invite the operator.',
    tags: ['auth'],
    body: signupInput,
    status: 201,
    errors: [BAD_REQUEST, error(403, 'Sign-up is disabled on this deployment.')],
    example: {
      firstName: 'Paul',
      lastName: 'Mbarga',
      email: 'paul.mbarga@example.cm',
      password: 'correct-horse-battery',
    },
  },
  'POST /v1/auth/login': {
    summary: 'Sign in',
    description:
      'Returns `{ token, operator }`, or a `challenge` when e-mail verification, a password change or TOTP enrolment is still required. The same endpoint continues the handshake: post the challenge and the next factor back to it.',
    tags: ['auth'],
    body: credentials,
    errors: [BAD_REQUEST],
    example: { email: 'amina.njoya@example.cm', password: 'correct-horse-battery' },
  },
  'POST /v1/auth/password': {
    summary: 'Replace a password from a challenge',
    description: 'Completes the `password_change` branch of the sign-in handshake.',
    tags: ['auth'],
    body: passwordChange,
    errors: [BAD_REQUEST],
    example: { challenge: 'chg_9f2c6b1e', password: 'a-longer-new-password' },
  },
  'POST /v1/auth/password/forgot': {
    summary: 'Request a password-reset link',
    description:
      'Always answers the same way, whether or not the address exists: the endpoint must not become an account oracle.',
    tags: ['auth'],
    body: forgotInput,
    errors: [BAD_REQUEST, error(403, 'Password mail is disabled on this deployment.')],
    example: { email: 'amina.njoya@example.cm' },
  },
  'POST /v1/auth/password/reset': {
    summary: 'Reset a password with a signed link',
    description: 'Consumes the signed token from the reset e-mail and invalidates the previous password.',
    tags: ['auth'],
    body: resetInput,
    errors: [BAD_REQUEST],
    example: { token: 'reset_7d1a4c93', password: 'a-longer-new-password' },
  },
  'POST /v1/auth/email/verify': {
    summary: 'Confirm an e-mail address',
    description: 'Consumes the signed token from the confirmation e-mail and marks the address verified.',
    tags: ['auth'],
    body: emailVerifyInput,
    errors: [BAD_REQUEST],
    example: { token: 'verify_41b0c9e2' },
  },
  'POST /v1/auth/email/resend': {
    summary: 'Resend the confirmation e-mail',
    description: 'Issues a fresh confirmation link for an address that is still unverified. Answers the same way whether or not the address exists.',
    tags: ['auth'],
    body: forgotInput,
    errors: [BAD_REQUEST],
    example: { email: 'paul.mbarga@example.cm' },
  },
  'POST /v1/auth/mfa/enroll': {
    summary: 'Start TOTP enrolment',
    description: 'Returns the shared secret and the `otpauth://` URI to render as a QR code.',
    tags: ['auth'],
    body: mfaChallengeInput,
    errors: [BAD_REQUEST],
    example: { challenge: 'mfa_2c81d4a7' },
  },
  'POST /v1/auth/mfa/confirm': {
    summary: 'Confirm TOTP enrolment and open a session',
    description: 'Checks the first six-digit code against the enrolled secret, then returns the session token.',
    tags: ['auth'],
    body: codeStep,
    errors: [BAD_REQUEST],
    example: { challenge: 'mfa_2c81d4a7', code: '123456' },
  },
  'POST /v1/auth/mfa/verify': {
    summary: 'Second factor for an enrolled operator',
    description: 'Completes the `mfa` branch of the sign-in handshake with a TOTP code and returns the session token.',
    tags: ['auth'],
    body: codeStep,
    errors: [BAD_REQUEST],
    example: { challenge: 'mfa_2c81d4a7', code: '123456' },
  },
  'GET /v1/auth/me': {
    summary: 'Current operator',
    description: 'Returns the public profile behind the bearer token, including the administrator flag.',
    tags: ['auth'],
    errors: [error(401, 'The session is missing, expired or revoked.')],
  },
  'GET /v1/operators': {
    summary: 'Operator directory',
    description:
      'Every account, identity only. Administrator only: the observability scope needs the accounts that spent nothing in the selected window.',
    tags: ['auth'],
    errors: [
      error(401, 'The session is missing, expired or revoked.'),
      error(403, 'The caller is not an administrator.'),
    ],
  },
  'POST /v1/auth/logout': {
    summary: 'Record a sign-out',
    description:
      'Revokes every token issued to the account, records the event in the audit chain, and the client drops its token.',
    tags: ['auth'],
  },
  'GET /v1/preferences': {
    summary: 'Operator preferences',
    description: 'Theme, pack, locale, density, radius and notification consent.',
    tags: ['auth'],
    errors: [error(401, 'The session is missing, expired or revoked.')],
  },
  'PUT /v1/preferences': {
    summary: 'Update operator preferences',
    description: 'A partial update: an omitted field keeps its stored value.',
    tags: ['auth'],
    body: preferencesPatch,
    errors: [BAD_REQUEST, error(401, 'The session is missing, expired or revoked.')],
    example: { locale: 'fr', density: 'compact' },
  },
  'GET /v1/audit/events': {
    summary: 'Audit feed for the signed-in operator',
    description:
      'Newest first, optionally filtered by free text and window. `stats` adds the daily counts the console draws as a sparkline.',
    tags: ['audit'],
    query: auditQuery,
    errors: [BAD_REQUEST, SERVICE_UNAVAILABLE],
  },

  /* ── Models ────────────────────────────────────────────────────────────── */
  'GET /v1/models': {
    summary: 'Models available to this key',
    description:
      'Meta Model API catalog. Empty in local or sovereign mode, where the deployment serves a fixed model set.',
    tags: ['models'],
    errors: [BAD_GATEWAY],
  },
  'PUT /v1/models/selection': {
    summary: 'Select a model for the operator',
    description:
      'The choice is saved per operator; the shared engine applies one model at a time. A model absent from `GET /v1/models` answers 409.',
    tags: ['models'],
    body: modelSelectionInput,
    errors: [BAD_REQUEST, error(401, 'The session is missing or expired.'), CONFLICT, BAD_GATEWAY],
    example: { model: 'muse-spark-1' },
  },

  /* ── Agents ────────────────────────────────────────────────────────────── */
  'GET /v1/attachments/limits': {
    summary: 'Image limits for the assistant',
    description:
      'The caps this deployment applies to assistant images: count per message, bytes per image, and the accepted MIME types. The console enforces them in the composer.',
    tags: ['agents'],
  },
  'GET /v1/attachments/:file/:variant': {
    summary: 'Read a chat image',
    description:
      'Public: the bytes are content-addressed and the query string carries an HMAC capability. `full` answers the original image, `thumb` a WebP thumbnail. Answers the image itself, not JSON, with an immutable cache policy.',
    tags: ['agents'],
    params: z.object({
      file: z.string().describe('`<sha256>.<ext>` returned with the assessment attachments.'),
      variant: z.enum(['full', 'thumb']).describe('Original image or WebP thumbnail.'),
    }),
    query: z.object({ sig: z.string().describe('HMAC capability signed by the API.') }),
    responseType: 'image/*',
    errors: [error(403, 'The signature is missing or does not match.'), NOT_FOUND],
  },
  'POST /v1/attachments': {
    summary: 'Store a chat image',
    description:
      'Uploads one image once and returns its stored reference. The request body is the raw image bytes, with the image MIME type as `Content-Type` and the display name percent-encoded in `X-File-Name`. A message then names the reference in `attachmentRefs` (`POST /v1/agents/ask`), and the API reads the bytes back server-side for the vision model. The accepted types and byte cap come from `GET /v1/attachments/limits`.',
    tags: ['agents'],
    errors: [
      BAD_REQUEST,
      PAYLOAD_TOO_LARGE,
      error(415, 'The content type is not an accepted image MIME type.'),
      BAD_GATEWAY,
    ],
  },
  'POST /v1/agents/ask': {
    summary: 'Ask the mandated agents a question',
    description:
      'Runs the institutional agents for one domain and returns their assessment with citations. Every claim is grounded in the corpus; an ungrounded answer is refused rather than returned.',
    tags: ['agents'],
    body: askBody,
    errors: [BAD_REQUEST, error(404, 'No institution matches the requested domain and country.')],
    example: {
      institutionId: 'minsante',
      question: 'Quelles obligations impose la loi camerounaise sur la protection des données de santé ?',
      country: 'cm',
      domain: 'health',
      lens: 'hybrid',
      language: 'fr',
    },
  },
  'POST /v1/agents/ask/stream': {
    summary: 'Ask the agents and stream the answer',
    description:
      'Same input and validation as `POST /v1/agents/ask`. The answer arrives as server-sent events: `token` events carry text, `done` carries the final record with citations.',
    tags: ['agents'],
    body: askBody,
    responseType: 'text/event-stream',
    errors: [BAD_REQUEST, error(404, 'No institution matches the requested domain and country.')],
    example: {
      institutionId: 'minsante',
      question: 'Quelles obligations impose la loi camerounaise sur la protection des données de santé ?',
      country: 'cm',
      domain: 'health',
      lens: 'hybrid',
      language: 'fr',
    },
  },
  'POST /v1/agents/route': {
    summary: 'Route a question to the relevant agents',
    description:
      'Chooses one to three institutions from the selected sectors, or only among the given ids. Routing never answers the question itself.',
    tags: ['agents'],
    body: agentRoutingRequest,
    errors: [BAD_REQUEST, error(404, 'No institution matches the selected sectors.')],
    example: {
      question: 'Un hôpital peut-il transférer des données de patients vers un prestataire cloud ?',
      domains: ['health'],
    },
  },
  'POST /v1/voice/correct': {
    summary: 'Punctuate and correct a raw transcript',
    description:
      'Used by the microphone flow before the text is submitted. The corrector is not allowed to add facts: it only restores punctuation, casing and obvious dictation errors.',
    tags: ['voice'],
    body: voiceCorrectBody,
    errors: [BAD_REQUEST],
    example: { text: 'quelles obligations impose la loi sur la protection des donnees de sante' },
  },

  /* ── Country registry ──────────────────────────────────────────────────── */
  'GET /v1/registry/guarantees': {
    summary: 'List the registry guarantees',
    description: 'The guarantees no role, agent or instruction can lift, and the fixed capabilities roles are built from.',
    tags: ['registry'],
  },
  'GET /v1/registry/agent-specs': {
    summary: 'List the active agents for a work screen',
    description: 'Active agents as the engine sees them, optionally limited to comma-separated domains and ids.',
    tags: ['registry'],
    query: agentSpecsQuery,
    errors: [BAD_REQUEST],
  },
  'GET /v1/registry/roles': {
    summary: 'List roles',
    description: 'Roles: what an agent does, built from fixed capabilities. Built-in entries included.',
    tags: ['registry'],
  },
  'GET /v1/registry/roles/:id': {
    summary: 'Read one role',
    description: 'The current version of one role.',
    tags: ['registry'],
    params: registryIdParams,
    errors: [BAD_REQUEST, NOT_FOUND],
  },
  'GET /v1/registry/roles/:id/versions': {
    summary: 'List the versions of one role',
    description: 'Every saved state, newest first: runs record the version they used.',
    tags: ['registry'],
    params: registryIdParams,
    errors: [BAD_REQUEST],
  },
  'POST /v1/registry/roles': {
    summary: 'Create a role (administrator)',
    description: 'Creates a draft role, version 1, and records it in the audit chain.',
    tags: ['registry'],
    body: roleCreateSchema,
    status: 201,
    errors: [BAD_REQUEST, FORBIDDEN, CONFLICT],
    example: { id: 'legal_reviewer', name: 'Legal reviewer', description: 'Re-reads assessments against the law.', capabilities: ['review', 'retrieve'], requiresInstitution: false },
  },
  'PATCH /v1/registry/roles/:id': {
    summary: 'Edit a role (administrator)',
    description: 'Saves a new version and records it in the audit chain. The capabilities of a built-in role cannot change.',
    tags: ['registry'],
    params: registryIdParams,
    body: rolePatchSchema,
    errors: [BAD_REQUEST, FORBIDDEN, NOT_FOUND, UNPROCESSABLE],
    example: { description: 'Re-reads assessments against the national law.' },
  },
  'POST /v1/registry/roles/:id/status': {
    summary: 'Activate, retire or draft a role (administrator)',
    description: 'Changes the status as a new version. An agent is activated only if its role, its institution and its legal basis allow it, with a Meta model.',
    tags: ['registry'],
    params: registryIdParams,
    body: statusSchema,
    errors: [BAD_REQUEST, FORBIDDEN, NOT_FOUND, UNPROCESSABLE],
    example: { status: 'active' },
  },
  'GET /v1/registry/institutions': {
    summary: 'List institutions',
    description: 'Institutions: country, mandate, legal basis in the corpus, domains, limits. Built-in entries included.',
    tags: ['registry'],
  },
  'GET /v1/registry/institutions/:id': {
    summary: 'Read one institution',
    description: 'The current version of one institution.',
    tags: ['registry'],
    params: registryIdParams,
    errors: [BAD_REQUEST, NOT_FOUND],
  },
  'GET /v1/registry/institutions/:id/versions': {
    summary: 'List the versions of one institution',
    description: 'Every saved state, newest first: runs record the version they used.',
    tags: ['registry'],
    params: registryIdParams,
    errors: [BAD_REQUEST],
  },
  'POST /v1/registry/institutions': {
    summary: 'Create a institution (administrator)',
    description: 'Creates a draft institution, version 1, and records it in the audit chain.',
    tags: ['registry'],
    body: institutionCreateSchema,
    status: 201,
    errors: [BAD_REQUEST, FORBIDDEN, CONFLICT],
    example: { id: 'cnps', name: 'Social Insurance Fund', country: 'CM', mandate: 'Manages social security and its beneficiaries data.', legalBasis: [{ filename: 'loi_2024_protection_donnees.txt', article: '1' }], domains: ['public_services'], mustNot: [] },
  },
  'PATCH /v1/registry/institutions/:id': {
    summary: 'Edit a institution (administrator)',
    description: 'Saves a new version and records it in the audit chain. The capabilities of a built-in role cannot change.',
    tags: ['registry'],
    params: registryIdParams,
    body: institutionPatchSchema,
    errors: [BAD_REQUEST, FORBIDDEN, NOT_FOUND, UNPROCESSABLE],
    example: { legalBasis: [{ filename: 'loi_96_03_sante.txt', article: '2' }] },
  },
  'POST /v1/registry/institutions/:id/status': {
    summary: 'Activate, retire or draft a institution (administrator)',
    description: 'Changes the status as a new version. An agent is activated only if its role, its institution and its legal basis allow it, with a Meta model.',
    tags: ['registry'],
    params: registryIdParams,
    body: statusSchema,
    errors: [BAD_REQUEST, FORBIDDEN, NOT_FOUND, UNPROCESSABLE],
    example: { status: 'active' },
  },
  'GET /v1/registry/agents': {
    summary: 'List agents',
    description: 'Agents: a role, an institution when mandated, a Meta model and instructions. Built-in entries included.',
    tags: ['registry'],
  },
  'GET /v1/registry/agents/:id': {
    summary: 'Read one agent',
    description: 'The current version of one agent.',
    tags: ['registry'],
    params: registryIdParams,
    errors: [BAD_REQUEST, NOT_FOUND],
  },
  'GET /v1/registry/agents/:id/versions': {
    summary: 'List the versions of one agent',
    description: 'Every saved state, newest first: runs record the version they used.',
    tags: ['registry'],
    params: registryIdParams,
    errors: [BAD_REQUEST],
  },
  'POST /v1/registry/agents': {
    summary: 'Create a agent (administrator)',
    description: 'Creates a draft agent, version 1, and records it in the audit chain.',
    tags: ['registry'],
    body: agentCreateSchema,
    status: 201,
    errors: [BAD_REQUEST, FORBIDDEN, CONFLICT],
    example: { id: 'cnps_agent', name: 'Social Insurance Fund', roleId: 'mandated', institutionId: 'cnps', instructions: '', informationScope: 'domain_events', color: 'text-teal-500' },
  },
  'PATCH /v1/registry/agents/:id': {
    summary: 'Edit a agent (administrator)',
    description: 'Saves a new version and records it in the audit chain. The capabilities of a built-in role cannot change.',
    tags: ['registry'],
    params: registryIdParams,
    body: agentPatchSchema,
    errors: [BAD_REQUEST, FORBIDDEN, NOT_FOUND, UNPROCESSABLE],
    example: { instructions: 'Answer in French when the question is in French.' },
  },
  'POST /v1/registry/agents/:id/status': {
    summary: 'Activate, retire or draft a agent (administrator)',
    description: 'Changes the status as a new version. An agent is activated only if its role, its institution and its legal basis allow it, with a Meta model.',
    tags: ['registry'],
    params: registryIdParams,
    body: statusSchema,
    errors: [BAD_REQUEST, FORBIDDEN, NOT_FOUND, UNPROCESSABLE],
    example: { status: 'active' },
  },
  'GET /v1/countries': {
    summary: 'List countries',
    description: 'Every country record, active and planned, with its sectors and authority.',
    tags: ['countries'],
  },
  'POST /v1/countries': {
    summary: 'Add a country (administrator)',
    description: 'Adds a jurisdiction to the registry with its official names, authority and sectors. Codes are ISO 3166-1 alpha-2 and unique.',
    tags: ['countries'],
    body: countryBodySchema,
    status: 201,
    errors: [BAD_REQUEST, FORBIDDEN, CONFLICT],
    example: {
      code: 'cm',
      name: 'Cameroon',
      nameFr: 'Cameroun',
      region: 'Central Africa',
      currency: 'XAF',
      languages: ['fr', 'en'],
      timezone: 'Africa/Douala',
      status: 'active',
      sectors: ['health', 'education', 'telecom', 'public_services', 'agriculture'],
    },
  },
  'GET /v1/countries/:code': {
    summary: 'Read one country',
    description: 'Returns the registry entry: names, status, authority and the sectors the country is active in.',
    tags: ['countries'],
    params: countryCodeParams,
    errors: [BAD_REQUEST, NOT_FOUND],
  },
  'PATCH /v1/countries/:code': {
    summary: 'Update a country (administrator)',
    description: 'Partially updates the registry entry. Omitted fields keep their value; the code itself cannot change.',
    tags: ['countries'],
    params: countryCodeParams,
    body: countryPatchSchema,
    errors: [BAD_REQUEST, FORBIDDEN, NOT_FOUND],
    example: { status: 'active', authority: 'MINPOSTEL' },
  },
  'DELETE /v1/countries/:code': {
    summary: 'Delete a country (administrator)',
    description: 'Refused while the country still holds corpus documents: delete or move them first.',
    tags: ['countries'],
    params: countryCodeParams,
    errors: [BAD_REQUEST, FORBIDDEN, NOT_FOUND, CONFLICT],
  },
  'PUT /v1/countries/:code/sectors': {
    summary: 'Replace the sectors enabled for a country (administrator)',
    description: 'A complete replacement, not a merge: the body is the new list.',
    tags: ['countries'],
    params: countryCodeParams,
    body: countrySectorsInput,
    errors: [BAD_REQUEST, FORBIDDEN, NOT_FOUND],
    example: { sectors: ['health', 'education'] },
  },
  'GET /v1/countries/:code/insights': {
    summary: 'Corpus and readiness insights for a country',
    description: 'Document counts per sector, coverage gaps and the latest assessment, as the country screen shows them.',
    tags: ['countries'],
    params: countryCodeParams,
    errors: [BAD_REQUEST, NOT_FOUND],
  },

  /* ── Knowledge base ────────────────────────────────────────────────────── */
  'GET /v1/kb/status': {
    summary: 'Corpus and index status',
    description:
      'Live corpus and lexical-index state: document counts, `READY` versus `BUILDING` indexes, and the retrieval backend in use.',
    tags: ['knowledge'],
    errors: [BAD_GATEWAY],
  },
  'GET /v1/kb/documents': {
    summary: 'List corpus documents',
    description: 'Retired documents are hidden unless `includeRetired=true`.',
    tags: ['knowledge'],
    query: kbDocumentListQuery,
    errors: [BAD_REQUEST, BAD_GATEWAY],
  },
  'POST /v1/kb/documents/active': {
    summary: 'Retire or restore a document (administrator)',
    description:
      'Retiring a document removes it from retrieval without deleting its passages, so the audit trail keeps pointing at a real document.',
    tags: ['knowledge'],
    body: kbDocumentActiveInput,
    errors: [BAD_REQUEST, FORBIDDEN, BAD_GATEWAY],
    example: { filename: 'loi-2024-028-protection-donnees.pdf', active: false },
  },
  'DELETE /v1/kb/documents': {
    summary: 'Delete a document and its passages (administrator)',
    description: 'Removes the document and every indexed passage, so retrieval no longer returns either.',
    tags: ['knowledge'],
    query: kbDocumentQuery,
    errors: [BAD_REQUEST, FORBIDDEN, BAD_GATEWAY],
  },
  'GET /v1/kb/documents/preview': {
    summary: 'Read one document, passage by passage',
    description: 'Returns the metadata and the requested passage, with the neighbours needed to show context.',
    tags: ['knowledge'],
    query: kbDocumentPreviewQuery,
    errors: [BAD_REQUEST, BAD_GATEWAY],
  },
  'GET /v1/kb/documents/chunks': {
    summary: 'List the passages of a document',
    description: 'Returns the indexed passages in reading order, with their identifiers for citation and passage-level edits.',
    tags: ['knowledge'],
    query: kbDocumentQuery,
    errors: [BAD_REQUEST],
  },
  'PATCH /v1/kb/documents': {
    summary: 'Edit document metadata (administrator)',
    description:
      'Metadata changes propagate to every passage, so retrieval filters see the same country and document type everywhere.',
    tags: ['knowledge'],
    body: kbDocumentPatch,
    errors: [BAD_REQUEST, FORBIDDEN],
    example: { filename: 'loi-2024-028-protection-donnees.pdf', title: 'Loi n° 2024/028 sur la protection des données', docType: 'law' },
  },
  'PATCH /v1/kb/chunks/:id': {
    summary: 'Edit or retire one passage (administrator)',
    description: 'Editing a passage re-embeds it; retiring it leaves the row in place but out of retrieval.',
    tags: ['knowledge'],
    params: pathParam('id', 'Passage identifier returned by `GET /v1/kb/documents/chunks`.'),
    body: kbChunkPatch,
    errors: [BAD_REQUEST, FORBIDDEN, NOT_FOUND, UNPROCESSABLE],
    example: { active: false },
  },
  'POST /v1/kb/documents/images': {
    summary: 'Attach figures to a document (administrator)',
    description: 'Figures are stored with their caption, alternative text and the readiness dimension they illustrate.',
    tags: ['knowledge'],
    body: kbDocumentImagesInput,
    errors: [BAD_REQUEST, FORBIDDEN],
    example: {
      filename: 'loi-2024-028-protection-donnees.txt',
      images: [
        {
          caption: 'Répartition des dépenses de santé, 2025',
          alt: 'Graphique en barres des dépenses par région.',
          mime: 'image/png',
          dataBase64: 'iVBORw0KGgo=',
        },
      ],
    },
  },
  'PATCH /v1/kb/images/:id': {
    summary: 'Edit a figure (administrator)',
    description: 'Updates the caption, alternative text, tags or readiness dimension of one figure. The image bytes are unchanged.',
    tags: ['knowledge'],
    params: pathParam('id', 'Figure identifier returned with the document.'),
    body: kbImagePatch,
    errors: [BAD_REQUEST, FORBIDDEN, NOT_FOUND],
    example: { caption: 'Répartition des dépenses de santé, 2025', dimension: 'budget' },
  },
  'DELETE /v1/kb/images/:id': {
    summary: 'Delete a figure (administrator)',
    description: 'Removes one figure from its document.',
    tags: ['knowledge'],
    params: pathParam('id', 'Figure identifier returned with the document.'),
    errors: [FORBIDDEN, NOT_FOUND],
  },
  'POST /v1/kb/images/reference': {
    summary: 'Store a reference image (administrator)',
    description: 'Keeps a canonical figure used to compare later uploads. Storage failures answer 502.',
    tags: ['knowledge'],
    errors: [FORBIDDEN, BAD_GATEWAY],
  },
  'GET /v1/kb/images/:id': {
    summary: 'Read a figure',
    description: 'Public: the bytes are unguessable and carry no session data. Answers the image itself, not JSON.',
    tags: ['knowledge'],
    params: pathParam('id', 'Figure identifier returned with the document.'),
    responseType: 'application/octet-stream',
    errors: [NOT_FOUND],
  },
  'POST /v1/kb/indexes': {
    summary: 'Rebuild the retrieval indexes (administrator)',
    description: 'Rebuilds the lexical index over the live corpus. Returns once the rebuild is accepted, not once it finishes.',
    tags: ['knowledge'],
    errors: [FORBIDDEN, BAD_GATEWAY],
  },
  'POST /v1/kb/ingest/text': {
    summary: 'Ingest a text document (administrator)',
    description:
      'Chunks, embeds and indexes plain text. The rights bucket decides: only `official-text` and `open-licence` may be stored in full, anything else answers 403 and the manifest normalises to `to-confirm`.',
    tags: ['knowledge'],
    body: kbIngestTextBody,
    response: ingestResponse,
    errors: [BAD_REQUEST, FORBIDDEN, UNPROCESSABLE],
    example: {
      text: 'Article 1er. — La présente loi fixe le cadre de protection des données à caractère personnel au Cameroun.',
      filename: 'loi-2024-028-protection-donnees.txt',
      country: 'cm',
      docType: 'law',
      rights: 'official-text',
    },
  },
  'POST /v1/kb/ingest/file': {
    summary: 'Ingest a PDF or text file (administrator)',
    description:
      'The filename suffix selects the extractor. The payload is base64 and capped at 25 MB decoded. Rights are checked before extraction.',
    tags: ['knowledge'],
    body: kbIngestFileBody,
    response: ingestResponse,
    errors: [BAD_REQUEST, FORBIDDEN, PAYLOAD_TOO_LARGE, UNPROCESSABLE],
    example: {
      filename: 'loi-2024-028-protection-donnees.txt',
      contentBase64: 'aGVsbG8=',
      country: 'cm',
      docType: 'law',
      rights: 'official-text',
    },
  },
  'POST /v1/kb/search': {
    summary: 'Search the corpus',
    description:
      'Hybrid retrieval over the live corpus. `depth` trades latency for recall: `lexical` skips the vector stage, `deep` runs the full staged search and rerank.',
    tags: ['knowledge'],
    body: searchInput,
    errors: [BAD_REQUEST, BAD_GATEWAY],
    example: { text: 'protection des données de santé', country: 'cm', topK: 6 },
  },
  'POST /v1/kb/ingest': {
    summary: 'Ingest text (compatibility alias)',
    description:
      'Older consoles post here. It accepts the same fields as `POST /v1/kb/ingest/text` but validates them more loosely; prefer the `/text` and `/file` routes.',
    tags: ['knowledge'],
    body: kbIngestAliasBody,
    response: ingestResponse,
    errors: [BAD_REQUEST, FORBIDDEN],
    example: {
      text: 'Article 1er. — La présente loi fixe le cadre de protection des données à caractère personnel au Cameroun.',
      filename: 'loi-2024-028-protection-donnees.txt',
      country: 'cm',
      docType: 'law',
      rights: 'official-text',
    },
  },

  /* ── Scenarios ─────────────────────────────────────────────────────────── */
  'GET /v1/scenarios/:id/release': {
    summary: 'Stream every tick of a scenario (passive viewer)',
    description:
      'Server-sent events, one `data:` frame per chunk, then `event: done`. A read-only view: it creates no run and records no decision.',
    tags: ['scenarios'],
    query: scenarioReleaseQuery,
    responseType: 'text/event-stream',
    errors: [BAD_REQUEST],
  },
  'POST /v1/scenarios/start': {
    summary: 'Open a facilitator session',
    description:
      'Builds the agenda and returns it; no model runs and no content is released yet. Each `next` call releases one tick.',
    tags: ['scenarios'],
    body: scenarioRunInput,
    errors: [BAD_REQUEST],
    example: { id: 'health-data-breach', country: 'cm', domain: 'health', lang: 'fr' },
  },
  'POST /v1/scenarios/:runId/next': {
    summary: 'Release the next scenario tick',
    description:
      'The facilitator gate: the agents assess the newly released events and the coordinator reconciles them into a joint report. Answers 409 once the run is complete.',
    tags: ['scenarios'],
    params: scenarioRunParams,
    errors: [NOT_FOUND, CONFLICT, BAD_GATEWAY],
  },
  'GET /v1/scenarios/runs': {
    summary: 'List the operator scenario runs',
    description: 'Newest first, with status, progress and the reports already produced.',
    tags: ['scenarios'],
  },
  'GET /v1/scenarios/runs/:runId': {
    summary: 'Read one saved run',
    description: 'Status, released ticks, joint reports and the scenario events, including those not yet released.',
    tags: ['scenarios'],
    params: scenarioRunParams,
    errors: [NOT_FOUND],
  },
  'DELETE /v1/scenarios/runs/:runId': {
    summary: 'Delete a saved run',
    description:
      'Deletes the run record and its session. The audit entries and chain-of-thought traces stay: the journal is append-only.',
    tags: ['scenarios'],
    params: scenarioRunParams,
    errors: [NOT_FOUND],
  },
  'GET /v1/scenarios/runs/:runId/export': {
    summary: 'Export a run as a file',
    description:
      'JSON, Markdown, a self-contained HTML page, or a Word document built by the document MCP server, like the readiness report.',
    tags: ['scenarios'],
    params: scenarioRunParams,
    query: scenarioExportQuery,
    errors: [BAD_REQUEST, NOT_FOUND, BAD_GATEWAY],
  },
  'POST /v1/scenarios/runs/:runId/resume': {
    summary: 'Resume an interrupted run',
    description:
      'Rebuilds the session from the last released tick. Released ticks are not replayed. A complete run answers 409.',
    tags: ['scenarios'],
    params: scenarioRunParams,
    errors: [NOT_FOUND, CONFLICT],
  },
  'GET /v1/scenarios/:runId': {
    summary: 'Current state of a live session',
    description: 'Returns the scenario, its tick history and the decisions made so far, without advancing the run.',
    tags: ['scenarios'],
    params: scenarioRunParams,
    errors: [NOT_FOUND],
  },
  'POST /v1/scenarios/run': {
    summary: 'Play a scenario from start to finish',
    description:
      'Convenience wrapper for demonstrations: opens the session and runs every tick. Long-running; the console prefers `start` plus `next`.',
    tags: ['scenarios'],
    body: scenarioRunInput,
    errors: [BAD_REQUEST],
    example: { country: 'cm', domain: 'health', lang: 'en' },
  },

  /* ── Readiness ─────────────────────────────────────────────────────────── */
  'POST /v1/readiness/report': {
    summary: 'Stream a readiness report',
    description:
      'Assesses one sector and streams the reasoning and the final report as server-sent events. The report itself is persisted under a run id.',
    tags: ['readiness'],
    body: readinessAssessInput,
    responseType: 'text/event-stream',
    errors: [BAD_REQUEST],
    example: { country: 'cm', domain: 'health', globalCountry: 'global' },
  },
  'POST /v1/readiness/stream': {
    summary: 'Run a readiness assessment and stream it',
    description:
      'The full pipeline: retrieve per dimension, evaluate against the corpus, synthesise. `concurrency` and `models` let an operator trade latency against depth. Interrupted assessments are kept and can be resumed.',
    tags: ['readiness'],
    body: readinessStreamInput,
    responseType: 'text/event-stream',
    errors: [BAD_REQUEST],
    example: { country: 'cm', domain: 'health', useWeb: false, concurrency: 'orchestrated' },
  },
  'GET /v1/readiness/batches/:batchId': {
    summary: 'Read every assessment of a batch',
    description: 'A batch groups runs launched together, for instance one per sector. Empty when the id is unknown.',
    tags: ['readiness'],
    params: pathParam('batchId', 'Batch id supplied when the assessments were launched.'),
    errors: [BAD_REQUEST],
  },
  'POST /v1/readiness/runs/:id/resume': {
    summary: 'Resume an interrupted assessment',
    description: 'Only a `failed` assessment that kept its input can be resumed; anything else answers 409.',
    tags: ['readiness'],
    params: pathParam('id', 'Assessment identifier.'),
    errors: [NOT_FOUND, CONFLICT, BAD_GATEWAY],
  },
  'GET /v1/readiness/runs': {
    summary: 'List readiness assessments',
    description: 'Paginated, newest first, with filters over the title, the sectors and the status.',
    tags: ['readiness'],
    query: readinessRunsQuery,
    errors: [BAD_REQUEST],
  },
  'GET /v1/readiness/runs/:id': {
    summary: 'Read one readiness assessment',
    description: 'Returns the scores, the narrative and the citations of one persisted assessment. Reading does not re-run it.',
    tags: ['readiness'],
    params: pathParam('id', 'Assessment identifier.'),
    errors: [NOT_FOUND],
  },
  'DELETE /v1/readiness/runs/:id': {
    summary: 'Delete a readiness assessment',
    description: 'Removes one assessment. It belongs to the caller; an id that does not belong to the caller answers 404.',
    tags: ['readiness'],
    params: pathParam('id', 'Assessment identifier.'),
    errors: [NOT_FOUND],
  },
  'POST /v1/readiness/runs/:id/localize': {
    summary: 'Translate a readiness report',
    description: 'Rewrites the narrative in the target language. Scores and citations are not translated.',
    tags: ['readiness'],
    params: pathParam('id', 'Assessment identifier.'),
    body: readinessLocalizeInput,
    errors: [BAD_REQUEST, NOT_FOUND, BAD_GATEWAY],
    example: { lang: 'fr' },
  },
  'POST /v1/readiness/runs/:id/report': {
    summary: 'Build a readiness report document',
    description: 'Markdown, HTML or Word. The Word file is produced by the document MCP server.',
    tags: ['readiness'],
    params: pathParam('id', 'Assessment identifier.'),
    body: readinessReportInput,
    errors: [BAD_REQUEST, NOT_FOUND, BAD_GATEWAY],
    example: { format: 'markdown', lang: 'fr' },
  },
  'POST /v1/readiness/whatif': {
    summary: 'Project the effect of a score change',
    description:
      'Applies dimension deltas to a baseline and returns the projected readiness, with the assumptions. Without `scores` it runs a full assessment first, which is slow.',
    tags: ['readiness'],
    body: readinessWhatIfInput,
    errors: [BAD_REQUEST, BAD_GATEWAY],
    example: { country: 'cm', domain: 'health', changes: { budget: 2, governance: 1 } },
  },

  /* ── Gazette ───────────────────────────────────────────────────────────── */
  'POST /v1/gazette/analyze': {
    summary: 'Transcribe an official gazette page',
    description:
      'Sends one page image to the vision model and returns the zones it found, with their text and coordinates. Each page is capped: oversized images answer 413.',
    tags: ['gazette'],
    body: gazetteAnalyzeInput,
    errors: [BAD_REQUEST, PAYLOAD_TOO_LARGE, UNPROCESSABLE, BAD_GATEWAY],
    example: {
      filename: 'gazette-2024-001-page-1.png',
      imageBase64: 'iVBORw0KGgo=',
      mime: 'image/png',
      page: 1,
      maxZones: 24,
    },
  },
  'POST /v1/gazette/ingest': {
    summary: 'Ingest an analysed gazette page (administrator)',
    description:
      'Takes the page object returned by `POST /v1/gazette/analyze` verbatim and files its text in the corpus. Gazette text is official by default.',
    tags: ['gazette'],
    body: gazetteIngestInput,
    response: ingestResponse,
    errors: [BAD_REQUEST, FORBIDDEN, UNPROCESSABLE, INTERNAL],
    example: {
      page: { documentId: 'gazette-2024-001', regions: [] },
      country: 'cm',
      docType: 'regulation',
      rights: 'official-text',
    },
  },

  /* ── Actions ───────────────────────────────────────────────────────────── */
  'GET /v1/actions': {
    summary: 'Proposed actions awaiting a decision',
    description:
      'Every side effect the agents proposed is queued here. Nothing is executed until an operator decides, and the decision is written to the audit chain.',
    tags: ['actions'],
  },
  'POST /v1/actions/:id/decision': {
    summary: 'Approve or reject a proposed action',
    description:
      'Single-use: a second decision on the same action answers 409. A failed execution is reported as 500 after the decision is recorded.',
    tags: ['actions'],
    params: pathParam('id', 'Proposed action identifier returned by `GET /v1/actions`.'),
    body: actionDecisionInput,
    errors: [BAD_REQUEST, NOT_FOUND, CONFLICT, INTERNAL],
    example: { decision: 'approve' },
  },

  /* ── Chat ──────────────────────────────────────────────────────────────── */
  'GET /v1/chat/attachments': {
    summary: 'List the operator image library',
    description:
      "Returns the images saved across the caller's conversations, newest first and deduplicated by id, so the assistant media picker can re-attach a stored reference without uploading it again. Only the caller's own sessions are read.",
    tags: ['chat'],
  },
  'GET /v1/chat/sessions': {
    summary: 'List conversation sessions',
    description: 'Lists the sessions saved by the caller, newest first, with just enough metadata to reopen one.',
    tags: ['chat'],
  },
  'GET /v1/chat/sessions/:id': {
    summary: 'Read one conversation session',
    description: 'Returns the stored turns verbatim. A session that belongs to another operator answers 404.',
    tags: ['chat'],
    params: pathParam('id', 'Conversation session identifier.'),
    errors: [NOT_FOUND],
  },
  'PUT /v1/chat/sessions/:id': {
    summary: 'Save a conversation session',
    description: 'Upsert: the console saves after each turn. Turns are stored verbatim and capped at 200.',
    tags: ['chat'],
    params: pathParam('id', 'Conversation session identifier.'),
    body: chatSessionInput,
    errors: [BAD_REQUEST],
    example: { title: 'Protection des données de santé', turns: [] },
  },
  'DELETE /v1/chat/sessions/:id': {
    summary: 'Delete a conversation session',
    description: 'Removes one saved conversation. A session that belongs to another operator answers 404.',
    tags: ['chat'],
    params: pathParam('id', 'Conversation session identifier.'),
    errors: [NOT_FOUND],
  },

  /* ── Impact ────────────────────────────────────────────────────────────── */
  'POST /v1/impact/analyze': {
    summary: 'Analyse the impact of a new provision',
    description:
      'Re-opens persisted scenario runs and ranks what the new provision changes for each of them. The provision is analysed against real runs, never against invented ones.',
    tags: ['impact'],
    body: impactAnalyzeInput,
    errors: [BAD_REQUEST, NOT_FOUND, UNPROCESSABLE, BAD_GATEWAY],
    example: {
      provision: {
        title: 'Obligation de notification des violations de données',
        text: 'Tout responsable de traitement notifie toute violation de données à caractère personnel à l’autorité de contrôle.',
        articleNumber: 'Article 12',
        docType: 'law',
      },
      runIds: ['run_01'],
    },
  },

  /* ── WhatsApp ──────────────────────────────────────────────────────────── */
  'GET /v1/whatsapp/webhook': {
    summary: 'Meta webhook verification challenge',
    description: 'Meta calls it once with `hub.mode`, `hub.verify_token` and `hub.challenge`. A wrong token answers 403.',
    tags: ['whatsapp'],
    errors: [FORBIDDEN],
  },
  'POST /v1/whatsapp/webhook': {
    summary: 'Inbound WhatsApp events',
    description:
      'Signed with `x-hub-signature-256`. A cloud deployment refuses an unsigned event with 401; a local install without WhatsApp configured answers 503. Inbound text is acknowledged, never treated as an approval.',
    tags: ['whatsapp'],
    errors: [error(401, 'The signature is missing or does not match the body.'), SERVICE_UNAVAILABLE],
  },
  'POST /v1/whatsapp/notify': {
    summary: 'Notify a recipient on WhatsApp (administrator)',
    description:
      'Sends one template: joint report, deadline alert or approval request. `dryRun` builds the payload without contacting Meta. `approval_request` returns a signed, expiring link.',
    tags: ['whatsapp'],
    body: notifyInput,
    errors: [BAD_REQUEST, FORBIDDEN, BAD_GATEWAY, SERVICE_UNAVAILABLE],
    example: {
      kind: 'joint_report',
      runId: 'run_3f2a',
      tick: 2,
      summary: 'Le ministre de la Santé a été informé ; la CNIL confirme le périmètre.',
      dryRun: true,
    },
  },
  'GET /v1/whatsapp/approvals/:token': {
    summary: 'Read a signed approval request',
    description: 'Public: the token is the credential. It returns what is being approved and when the link expires.',
    tags: ['whatsapp'],
    params: approvalTokenParams,
    errors: [NOT_FOUND],
  },
  'POST /v1/whatsapp/approvals/:token': {
    summary: 'Decide a signed approval request',
    description: 'Single-use: a second decision on the same link answers 409.',
    tags: ['whatsapp'],
    params: approvalTokenParams,
    body: approvalDecisionInput,
    errors: [BAD_REQUEST, NOT_FOUND, CONFLICT],
    example: { decision: 'approved', note: 'Validé par le secrétariat.' },
  },

  /* ── Notifications ─────────────────────────────────────────────────────── */
  'GET /v1/notifications/contacts': {
    summary: 'List notification contacts (administrator)',
    description: 'Addresses are masked in the listing; the console never displays a full number.',
    tags: ['notifications'],
    errors: [FORBIDDEN],
  },
  'POST /v1/notifications/contacts': {
    summary: 'Add a notification contact (administrator)',
    description: 'Phone numbers are normalised to E.164 before storage. A duplicate address answers 409.',
    tags: ['notifications'],
    body: notificationContactInput,
    status: 201,
    errors: [BAD_REQUEST, FORBIDDEN, CONFLICT],
    example: {
      name: 'Secrétariat du Ministère de la Santé',
      email: 'secretariat@example.cm',
      phone: '+237 6 99 00 00 00',
      phoneCountry: 'cm',
    },
  },
  'PUT /v1/notifications/contacts/:id': {
    summary: 'Update a notification contact (administrator)',
    description: 'Replaces one address-book entry: its name and the channels it accepts. The identifier is kept.',
    tags: ['notifications'],
    params: pathParam('id', 'Contact identifier.'),
    body: notificationContactInput,
    errors: [BAD_REQUEST, FORBIDDEN, NOT_FOUND, CONFLICT],
    example: { name: 'Cellule de crise', channels: { email: true, whatsapp: true } },
  },
  'DELETE /v1/notifications/contacts/:id': {
    summary: 'Delete a notification contact (administrator)',
    description: 'Removes one address-book entry.',
    tags: ['notifications'],
    params: pathParam('id', 'Contact identifier.'),
    errors: [FORBIDDEN, NOT_FOUND],
  },
  'GET /v1/notifications/status': {
    summary: 'Notification channels available',
    description: 'Says whether e-mail and WhatsApp are configured, without exposing an address or a key.',
    tags: ['notifications'],
  },
  'POST /v1/notifications/summary-suggestion': {
    summary: 'Draft a notification summary',
    description:
      'Builds a factual draft from the latest joint report of a run. The operator edits it before sending; the model never sends.',
    tags: ['notifications'],
    body: summarySuggestionInput,
    errors: [BAD_REQUEST, NOT_FOUND, BAD_GATEWAY],
    example: { runId: 'run_3f2a', kind: 'joint_report', locale: 'fr' },
  },
  'POST /v1/notifications/whatsapp': {
    summary: 'Message notification contacts on WhatsApp (administrator)',
    description: 'Sends one template to up to 50 contacts whose WhatsApp consent is on. Contacts without consent are skipped.',
    tags: ['notifications'],
    body: whatsappMessageInput,
    errors: [BAD_REQUEST, FORBIDDEN, SERVICE_UNAVAILABLE],
    example: { contactIds: ['cnt_7a1'], kind: 'test', summary: 'Test de la chaîne de notification.' },
  },
  'POST /v1/notifications/email': {
    summary: 'E-mail notification contacts (administrator)',
    description:
      'Sends one HTML message to up to 50 contacts whose e-mail consent is on. `ctaLabel` and `ctaUrl` are either both present or both absent.',
    tags: ['notifications'],
    body: emailMessageInput,
    errors: [BAD_REQUEST, FORBIDDEN, SERVICE_UNAVAILABLE],
    example: {
      contactIds: ['cnt_7a1'],
      subject: 'Rapport de situation — exercice santé',
      message: 'Le rapport du deuxième tick est disponible dans la console.',
      locale: 'fr',
    },
  },

  /* ── Exercises ─────────────────────────────────────────────────────────── */
  'GET /v1/exercise/sample': {
    summary: 'Sample table-top exercise',
    description: 'A ready-made health data-breach script, used to seed the exercise editor.',
    tags: ['exercise'],
    query: exerciseSampleQuery,
    errors: [BAD_REQUEST],
  },
  'POST /v1/exercise/evaluate': {
    summary: 'Evaluate an exercise',
    description:
      'Scores the action log against the injects. Whether an inject was addressed is computed from the log first; the model only narrates the result.',
    tags: ['exercise'],
    body: exerciseBodyInput,
    errors: [BAD_REQUEST],
    example: EXERCISE_EXAMPLE,
  },
  'GET /v1/exercise/reports': {
    summary: 'List the reports of an exercise',
    description: 'Lists the after-action reports saved for one exercise, identified by `exerciseId`.',
    tags: ['exercise'],
    query: exerciseReportsQuery,
    errors: [BAD_REQUEST],
  },
  'GET /v1/exercise/reports/:id': {
    summary: 'Read one exercise report',
    description: 'Returns the stored after-action report: scores, findings and the narrative generated from the evaluation.',
    tags: ['exercise'],
    params: pathParam('id', 'Exercise report identifier.'),
    errors: [NOT_FOUND],
  },
  'POST /v1/exercise/after-action': {
    summary: 'Write the after-action report',
    description:
      'Evaluates the exercise, then has the model narrate the findings. The evaluation is authoritative: the narration cannot change a score.',
    tags: ['exercise'],
    body: exerciseBodyInput,
    errors: [BAD_REQUEST, BAD_GATEWAY],
    example: EXERCISE_EXAMPLE,
  },

  /* ── Observability ─────────────────────────────────────────────────────── */
  'GET /v1/observability/events': {
    summary: 'Recent token-ledger events',
    description: 'The operator\'s own capability calls, newest first. Administrators may widen the scope with `operator`.',
    tags: ['observability'],
    query: observabilityEventsQuery,
    errors: [BAD_REQUEST],
  },
  'GET /v1/observability/summary': {
    summary: 'Usage summary over a window',
    description: 'Calls, tokens and cost per capability, model and route. Defaults to the last seven days.',
    tags: ['observability'],
    query: usageQuery,
    errors: [BAD_REQUEST],
  },
  'GET /v1/observability/requests': {
    summary: 'Request-level usage rows',
    description: 'One row per capability call, with its status, model, latency and cost.',
    tags: ['observability'],
    query: usageQuery,
    errors: [BAD_REQUEST],
  },
  'GET /v1/observability/forecast': {
    summary: 'Usage forecast',
    description: 'Projects the next seven days from the previous fourteen. A trend needs history: a young deployment forecasts flat.',
    tags: ['observability'],
    query: usageQuery,
    errors: [BAD_REQUEST],
  },
  'GET /v1/observability/budget': {
    summary: 'Run spend against the budget',
    description: 'Checks the last thirty days against the monthly budget and names the runs that drive the spend.',
    tags: ['observability'],
    query: usageQuery,
    errors: [BAD_REQUEST],
  },
  'GET /v1/observability/runs/:runId': {
    summary: 'Usage of one run',
    description: 'Every capability call made for a scenario or readiness run, with the aggregate cost.',
    tags: ['observability'],
    params: pathParam('runId', 'Run whose usage is read.'),
    errors: [BAD_REQUEST],
  },

  /* ── Audit ─────────────────────────────────────────────────────────────── */
  'GET /v1/audit/chain': {
    summary: 'Verify the audit chain',
    description:
      'Recomputes the hash chain and reports whether it is intact, with the first broken link when it is not.',
    tags: ['audit'],
  },
  'GET /v1/audit/trace/:runId': {
    summary: 'Reasoning trace of a run',
    description: 'The chain-of-thought traces recorded for a run, in order, scoped to its owner.',
    tags: ['audit'],
    params: pathParam('runId', 'Run whose reasoning trace is read.'),
    errors: [NOT_FOUND],
  },
  'GET /v1/audit/dossier/:runId': {
    summary: 'Run dossier',
    description:
      'Audit entries, traces, reports, citations and chain integrity in one document, as JSON or rendered Markdown.',
    tags: ['audit'],
    params: pathParam('runId', 'Run whose dossier is assembled.'),
    query: auditDossierQuery,
    errors: [BAD_REQUEST, NOT_FOUND, BAD_GATEWAY],
  },

  /* ── Voice ─────────────────────────────────────────────────────────────── */
  'POST /v1/voice/transcribe': {
    summary: 'Transcribe audio',
    description:
      'Accepts a base64 audio payload and returns the transcript. The model key stays server-side; an unconfigured deployment answers 503.',
    tags: ['voice'],
    errors: [BAD_REQUEST, PAYLOAD_TOO_LARGE, UNPROCESSABLE, SERVICE_UNAVAILABLE],
  },
  'GET /v1/voice/realtime': {
    summary: 'Realtime voice transcription socket',
    description:
      'WebSocket endpoint authenticated with `?token=`. The relay keeps the model key server-side and forwards audio frames; the token is never logged.',
    tags: ['voice'],
  },
}

export const TAG_DESCRIPTIONS: Record<string, string> = {
  system: 'Health, the active provider, and this reference itself.',
  auth: 'Sign-in, second factor, sessions and operator preferences.',
  audit: 'Append-only audit chain, reasoning traces and run dossiers.',
  models: 'Meta Model API catalog and per-operator selection.',
  agents: 'Mandated institutional agents, their router and the coordinator.',
  countries: 'Jurisdiction and sector registry.',
  registry: 'Agents & AI registry: roles, institutions and agents, versioned and audited.',
  knowledge: 'Legal corpus: documents, figures, ingestion and search.',
  scenarios: 'Crisis simulation: facilitator sessions, ticks and exports.',
  readiness: 'Readiness assessments, reports and what-if projections.',
  exercise: 'Table-top exercises and after-action reports.',
  gazette: 'Official gazette page analysis and ingestion.',
  impact: 'Impact of a new provision on persisted scenario runs.',
  actions: 'Proposed side effects awaiting an operator decision.',
  chat: 'Conversation history saved by the console.',
  notifications: 'Address book, e-mail and WhatsApp delivery.',
  whatsapp: 'Meta webhook, outbound templates and signed approvals.',
  observability: 'Token ledger: usage, forecast and budget.',
  voice: 'Speech transcription and the realtime socket.',
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
