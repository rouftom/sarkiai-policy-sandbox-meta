/**
 * Request schemas shared by request validation and the published OpenAPI
 * document. Handlers import these objects directly, so the specification is
 * generated from the same rules the API enforces; there is no second copy to
 * drift.
 *
 * Every field carries a `.describe()` where the name alone would leave a
 * reader guessing; the descriptions end up in `/openapi.json` and in the
 * schema tables at `/docs`.
 */

import { z } from 'zod'
import type { Domain } from '@sps/shared'
import { corpusRightsSchema } from '@sps/shared'
import type { GazettePage } from '@sps/gazette'
import { COUNTRY_SECTORS } from '../countries.js'

/* ── Authentication ──────────────────────────────────────────────────────── */

export const credentials = z.object({
  email: z.string().email().max(200).describe('Operator e-mail address.'),
  password: z.string().min(1).max(200).describe('Current password.'),
})

export const codeStep = z.object({
  challenge: z
    .string()
    .min(10)
    .max(4096)
    .describe('Opaque challenge returned by the previous step; it encodes the pending sign-in.'),
  code: z.string().min(4).max(32).describe('Six-digit TOTP code, or a one-time e-mail code.'),
})

export const setupInput = z.object({
  firstName: z.string().trim().min(2).max(60).describe('Root operator first name.'),
  lastName: z.string().trim().min(2).max(60).describe('Root operator last name.'),
  email: z.string().email().max(200).describe('Address that receives the generated password.'),
})

export const passwordChange = z.object({
  challenge: z.string().min(10).max(4096).describe('Challenge returned by `/v1/auth/login` when a password change is required.'),
  password: z.string().min(12).max(200).describe('New password, at least 12 characters.'),
})

export const forgotInput = z.object({
  email: z.string().email().max(200).describe('Address to send the reset link (or confirmation e-mail) to.'),
})

export const resetInput = z.object({
  token: z.string().min(10).max(4096).describe('Signed token from the reset e-mail.'),
  password: z.string().min(12).max(200).describe('New password, at least 12 characters.'),
})

export const signupInput = z.object({
  firstName: z.string().trim().min(2).max(60).describe('Operator first name.'),
  lastName: z.string().trim().min(2).max(60).describe('Operator last name.'),
  email: z.string().email().max(200).describe('Address that receives the confirmation e-mail.'),
  password: z.string().min(12).max(200).describe('Password, at least 12 characters.'),
})

export const emailVerifyInput = z.object({
  token: z.string().min(10).max(4096).describe('Signed token from the confirmation e-mail.'),
})

export const mfaChallengeInput = z.object({
  challenge: z.string().min(10).max(4096).describe('Challenge returned by `/v1/auth/login` for an operator who must enrol.'),
})

export const preferencesPatch = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional().describe('Console colour scheme.'),
  pack: z.string().max(40).optional().describe('Visual pack identifier.'),
  locale: z.enum(['en', 'fr']).optional().describe('Console language.'),
  density: z.enum(['comfortable', 'compact']).optional().describe('Row density.'),
  radius: z.enum(['rounded', 'square']).optional().describe('Corner style.'),
  notifications: z
    .object({
      whatsapp: z.boolean().describe('Receive WhatsApp notifications.'),
      email: z.boolean().describe('Receive e-mail notifications.'),
      digest: z.boolean().describe('Receive the periodic digest.'),
    })
    .partial()
    .optional()
    .describe('Per-channel notification consent; omitted channels are left unchanged.'),
})

export const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50).describe('Maximum events to return.'),
  offset: z.coerce.number().int().min(0).max(100_000).default(0).describe('Events to skip.'),
  q: z.string().trim().max(120).optional().describe('Free-text filter over the action and its target.'),
  stats: z.coerce.number().int().min(1).max(31).optional().describe('Also return daily counts for this many days.'),
  tz: z.string().trim().max(64).optional().describe('IANA timezone used to bucket the daily counts.'),
  from: z.string().trim().max(40).optional().describe('Only events at or after this ISO-8601 instant.'),
})

/* ── Models, agents and approvals ────────────────────────────────────────── */

export const modelSelectionInput = z.object({
  model: z.string().min(1).max(120).describe('Model id from `GET /v1/models`, as exposed by the Meta Model API.'),
})

export const lensSchema = z.enum(['simulation', 'readiness', 'hybrid'])

export const askBody = z.object({
  institutionId: z.string().describe('Institution the question is addressed to.'),
  question: z.string().min(1).describe('The operator question, in either supported language.'),
  country: z.string().length(2).describe('ISO 3166-1 alpha-2 country code the question is about.'),
  domain: z
    .enum(['health', 'education', 'telecom', 'public_services', 'agriculture'])
    .describe('Policy sector that selects the institutional frame.'),
  lens: lensSchema.default('hybrid').describe('Which analytical lens the agents answer through.'),
  /** The language of the answer: the console's. */
  language: z.enum(['fr', 'en']).default('en').describe('Language of the answer.'),
  runId: z.string().optional().describe('Existing run to append this answer to.'),
  /** Reasoning effort chosen in the console; absent lets the provider decide. */
  effort: z
    .enum(['minimal', 'low', 'medium', 'high'])
    .optional()
    .describe('Provider reasoning effort; absent leaves the choice to the model.'),
  // Untrusted images sent as vision context (never citable). Bounded per message
  // and per file; the route enforces the deployment's configured caps.
  attachments: z
    .array(
      z.object({
        mime: z.string().describe('MIME type of the image.'),
        dataBase64: z.string().describe('Base64 payload of the image.'),
        name: z.string().max(200).optional().describe('Display name.'),
      }),
    )
    .optional()
    .describe('Images sent as context (count and size caps come from `GET /v1/attachments/limits`). They are never citable.'),
  /**
   * Preferred over `attachments`: the console uploads each image once
   * (`POST /v1/attachments`) and a message only names the stored references.
   * The bytes are read back server-side for the vision model.
   */
  attachmentRefs: z
    .array(
      z.object({
        id: z
          .string()
          .min(1)
          .max(300)
          .describe('Stored image id: its SHA-256 (S3) or Cloudinary public id.'),
        mime: z.string().describe('MIME type the image was uploaded with.'),
        name: z.string().max(200).optional().describe('Display name.'),
      }),
    )
    .max(32)
    .optional()
    .describe(
      'Images already stored by this deployment, by reference. Takes precedence over `attachments`; caps come from `GET /v1/attachments/limits`. They are never citable.',
    ),
})

export const agentRoutingRequest = z.object({
  question: z.string().min(3).max(2000).describe('Question to route.'),
  domains: z
    .array(z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']))
    .min(1)
    .max(5)
    .describe('Sectors the router may choose institutions from.'),
  /** Chosen institutions: the router picks among them only. Empty or absent: every institution of the sectors. */
  institutionIds: z
    .array(z.string().max(80))
    .max(10)
    .optional()
    .describe('Restrict the choice to these institution ids; absent means every institution of the sectors.'),
})

/** ISO 3166-2 code for an instrument that applies below the country level. */
const subdivisionInput = z
  .string()
  .trim()
  .min(2)
  .max(8)
  .optional()
  .describe('ISO 3166-2 code of one subnational region (for example `US-CA`).')

export const searchInput = z.object({
  text: z.string().min(2).max(2000).describe('Search query.'),
  country: z
    .string()
    .min(2)
    .max(2)
    .or(z.literal('global'))
    .or(z.literal(''))
    .default('')
    .describe('Restrict to one country, `global`, or every country (empty).'),
  jurisdiction: z
    .enum(['national', 'subnational', 'regional', 'international'])
    .optional()
    .describe('Restrict to one legal scope.'),
  jurisdictions: z
    .array(z.enum(['national', 'subnational', 'regional', 'international']))
    .max(4)
    .optional()
    .describe('Restrict to several legal scopes at once (wins over `jurisdiction`).'),
  subdivision: subdivisionInput,
  docType: z.string().optional().describe('Restrict to one document type (law, policy, strategy, guidance, report…).'),
  namespace: z.string().optional().describe('Restrict to one corpus namespace.'),
  topK: z.number().int().min(1).max(12).default(6).describe('Number of passages to return.'),
  depth: z
    .enum(['lexical', 'fast', 'deep'])
    .default('deep')
    .describe('Retrieval depth: lexical only, fast vector, or the full staged search.'),
})

export const approvalTokenParams = z.object({
  token: z.string().min(1).max(4096).describe('Signed approval token carried by the WhatsApp link.'),
})

export const approvalDecisionInput = z.object({
  decision: z.enum(['approved', 'rejected']).describe('Operator decision.'),
  note: z.string().max(1000).optional().describe('Optional rationale stored with the decision.'),
})

/* ── Country registry ────────────────────────────────────────────────────── */

export const countryCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2}$/)
  .describe('ISO 3166-1 alpha-2 code, lowercase.')

export const countrySectorsSchema = z
  .enum(COUNTRY_SECTORS as unknown as [Domain, ...Domain[]])
  .array()
  .min(1)
  .max(COUNTRY_SECTORS.length)

export const countryBodySchema = z.object({
  code: countryCodeSchema,
  name: z.string().trim().min(2).max(80).describe('Country name in English.'),
  nameFr: z.string().trim().min(2).max(80).optional().describe('Country name in French.'),
  jurisdiction: z
    .enum(['national', 'regional', 'international'])
    .optional()
    .describe('Legal scope of the country record.'),
  region: z.string().trim().max(80).optional().describe('Geographic or political region.'),
  authority: z.string().trim().max(120).optional().describe('Competent authority named in the console.'),
  currency: z.string().trim().max(8).optional().describe('ISO 4217 currency code.'),
  languages: z
    .array(z.string().trim().min(2).max(8))
    .max(6)
    .optional()
    .describe('Working languages, as ISO 639-1 codes.'),
  timezone: z.string().trim().max(60).optional().describe('IANA timezone.'),
  status: z.enum(['active', 'planned']).optional().describe('Whether the country is usable in the console.'),
  notes: z.string().trim().max(600).optional().describe('Free-form editorial note.'),
  sectors: countrySectorsSchema.optional().describe('Sectors enabled for this country.'),
})

export const countryPatchSchema = countryBodySchema.omit({ code: true }).partial()

export const countrySectorsInput = z.object({
  sectors: countrySectorsSchema.describe('Complete replacement list of enabled sectors.'),
})

export const countryCodeParams = z.object({ code: countryCodeSchema })

/* ── Knowledge base ──────────────────────────────────────────────────────── */

const countryOrGlobal = z
  .union([z.string().length(2), z.literal('global')])
  .describe('ISO 3166-1 alpha-2 country code, or `global` for a cross-border instrument.')

const jurisdictionInput = z
  .enum(['national', 'subnational', 'regional', 'international'])
  .describe('Legal scope of the instrument.')

const documentFilename = z
  .string()
  .min(1)
  .max(300)
  .describe('Exact stored filename, as returned by the documents listing.')

const corpusRights = corpusRightsSchema.describe(
  'Reuse rights from the corpus manifest. Only `official-text` and `open-licence` may be ingested; anything else is refused with 403.',
)

export const kbDocumentListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50).describe('Maximum documents to return.'),
  q: z.string().max(120).optional().describe('Case-insensitive fragment of the title or filename.'),
  includeRetired: z.coerce
    .boolean()
    .default(false)
    .describe('Include documents deactivated with `POST /v1/kb/documents/active`.'),
})

export const kbDocumentQuery = z.object({ filename: documentFilename })

export const kbDocumentPreviewQuery = z.object({
  filename: documentFilename,
  chunkIndex: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Passage to open first. Absent selects the first passage.'),
})

export const kbDocumentActiveInput = z.object({
  filename: z.string().min(1).describe('Stored filename.'),
  active: z
    .boolean()
    .describe('`false` retires the document from retrieval without deleting its passages; `true` restores it.'),
})

export const kbDocumentPatch = z.object({
  filename: z.string().min(1).max(300).describe('Document to update.'),
  title: z.string().max(200).optional().describe('Display title.'),
  summary: z.string().max(2000).optional().describe('Editorial summary shown in the console.'),
  country: z.string().min(2).max(10).optional().describe('Country code propagated to every passage.'),
  docType: z.string().min(1).max(40).optional().describe('Document type propagated to every passage.'),
  namespace: z.string().max(80).optional().describe('Corpus namespace propagated to every passage.'),
  version: z.string().max(80).optional().describe('Version label propagated to every passage.'),
  sourceUrl: z
    .string()
    .url()
    .max(500)
    .optional()
    .or(z.literal(''))
    .describe('Canonical source URL; an empty string clears it.'),
})

export const kbChunkPatch = z.object({
  text: z.string().max(20_000).optional().describe('Replacement passage text.'),
  active: z.boolean().optional().describe('`false` retires the passage from retrieval.'),
})

export const kbDocumentImagesInput = z.object({
  filename: z.string().min(1).max(300).describe('Document the figures belong to.'),
  images: z
    .array(
      z.object({
        caption: z.string().min(1).max(300).describe('Caption shown under the figure.'),
        alt: z.string().max(300).optional().describe('Alternative text for accessibility.'),
        tags: z.array(z.string().max(40)).max(12).optional().describe('Search tags.'),
        dimension: z.string().max(60).optional().describe('Readiness dimension the figure illustrates.'),
        mime: z
          .enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])
          .describe('Image MIME type.'),
        dataBase64: z.string().min(4).max(30_000_000).describe('Base64 image payload.'),
      }),
    )
    .min(1)
    .max(12)
    .describe('Figures to attach, at most twelve per request.'),
})

export const kbImagePatch = z.object({
  caption: z.string().min(1).max(300).optional().describe('New caption.'),
  alt: z.string().max(300).optional().describe('New alternative text.'),
  tags: z.array(z.string().max(40)).max(12).optional().describe('Replacement tag list.'),
  dimension: z
    .string()
    .max(60)
    .nullable()
    .optional()
    .describe('Readiness dimension; `null` clears the assignment.'),
})

export const kbIngestTextBody = z.object({
  text: z
    .string()
    .min(24)
    .max(2_000_000)
    .describe('Plain text to chunk and index. The minimum is 24 characters.'),
  filename: z.string().min(1).max(200).describe('Stored name; a `.pdf` suffix is rewritten to `.txt`.'),
  country: countryOrGlobal,
  jurisdiction: jurisdictionInput.default('national'),
  subdivision: subdivisionInput,
  docType: z.string().min(1).default('policy').describe('Document type used by retrieval filters.'),
  rights: corpusRights.default('to-confirm'),
  namespace: z.string().max(80).optional().describe('Corpus namespace; defaults to the country corpus.'),
  version: z.string().max(80).optional().describe('Version label.'),
  sourceUrl: z.string().url().optional().describe('Canonical source URL.'),
  maxChars: z
    .number()
    .int()
    .min(300)
    .max(6000)
    .optional()
    .describe('Target chunk size in characters; the server default applies when absent.'),
  overlapChars: z
    .number()
    .int()
    .min(0)
    .max(1000)
    .optional()
    .describe('Characters shared by two consecutive chunks.'),
})

export const kbIngestFileBody = z.object({
  filename: z
    .string()
    .min(1)
    .max(200)
    .describe('File name ending in `.pdf` or `.txt`; the suffix selects the extractor.'),
  contentBase64: z.string().min(4).max(34_000_000).describe('Base64 file payload (maximum 25 MB decoded).'),
  country: countryOrGlobal,
  jurisdiction: jurisdictionInput.default('national'),
  subdivision: subdivisionInput,
  docType: z.string().min(1).default('policy').describe('Document type used by retrieval filters.'),
  rights: corpusRights.default('to-confirm'),
  namespace: z.string().max(80).optional().describe('Corpus namespace.'),
  version: z.string().max(80).optional().describe('Version label.'),
  sourceUrl: z.string().url().optional().describe('Canonical source URL.'),
})

export const kbIngestAliasBody = z.object({
  text: z.string().min(1).describe('Plain text to chunk and index.'),
  filename: z.string().min(1).describe('Stored filename.'),
  country: countryOrGlobal,
  jurisdiction: jurisdictionInput.default('national'),
  subdivision: subdivisionInput,
  docType: z.string().default('policy').describe('Document type used by retrieval filters.'),
  rights: corpusRights.default('to-confirm'),
  namespace: z.string().optional().describe('Corpus namespace.'),
  version: z.string().optional().describe('Version label.'),
  sourceUrl: z.string().url().optional().describe('Canonical source URL.'),
})

/* ── Scenarios ───────────────────────────────────────────────────────────── */

export const scenarioRunInput = z.object({
  id: z.string().default('health-data-breach').describe('Scenario identifier from the scenario catalogue.'),
  country: z.string().length(2).default('cm').describe('ISO 3166-1 alpha-2 country code.'),
  domain: z
    .enum(['health', 'education', 'telecom', 'public_services', 'agriculture'])
    .default('health')
    .describe('Policy sector the scenario is played in.'),
  lang: z.enum(['fr', 'en']).default('en').describe('Language of the generated reports.'),
  agentIds: z
    .array(z.string().regex(/^[a-z0-9][a-z0-9_-]*$/))
    .max(12)
    .optional()
    .describe("Agents from the Agents & AI registry taking part; omitted, the sector's active agents."),
})

export const scenarioReleaseQuery = z.object({
  country: z.string().default('cm').describe('Country whose institutions play the scenario.'),
})

export const scenarioExportQuery = z.object({
  format: z
    .enum(['json', 'markdown', 'html', 'docx'])
    .default('json')
    .describe('Dossier format. `docx` is built from the Markdown rendering.'),
})

export const scenarioRunParams = z.object({
  runId: z.string().describe('Scenario run identifier returned by `/v1/scenarios/start`.'),
})

/* ── Readiness ───────────────────────────────────────────────────────────── */

export const readinessRunsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).describe('Page number, one-based.'),
  limit: z.coerce.number().int().min(1).max(100).default(10).describe('Assessments per page.'),
  q: z.string().max(100).optional().describe('Free-text filter over the assessment title.'),
  domain: z
    .string()
    .max(300)
    .optional()
    .describe('Comma-separated sectors; unknown values are ignored.'),
  status: z
    .string()
    .max(60)
    .optional()
    .describe('Comma-separated statuses; only `complete` and `failed` are honoured.'),
})

export const readinessAssessInput = z.object({
  country: z.string().length(2).describe('ISO 3166-1 alpha-2 country code.'),
  domain: z
    .enum(['health', 'education', 'telecom', 'public_services', 'agriculture'])
    .describe('Policy sector to assess.'),
  globalCountry: z
    .string()
    .default('global')
    .describe('Corpus namespace used for the international reference material.'),
})

export const readinessStreamInput = readinessAssessInput.extend({
  dimensions: z
    .array(z.string().max(60))
    .min(1)
    .max(13)
    .optional()
    .describe('Restrict the assessment to these dimension short names.'),
  perDimensionK: z
    .number()
    .int()
    .min(2)
    .max(10)
    .optional()
    .describe('Documents retrieved per dimension.'),
  useWeb: z.boolean().optional().describe('Allow the agents to consult the web in addition to the corpus.'),
  reasoningEffort: z
    .enum(['minimal', 'low', 'medium', 'high'])
    .optional()
    .describe('Provider reasoning effort.'),
  models: z
    .object({
      webSearch: z.string().min(1).max(80).optional().describe('Model used for web search.'),
      evaluate: z.string().min(1).max(80).optional().describe('Model used to score dimensions.'),
      synthesis: z.string().min(1).max(80).optional().describe('Model used to write the synthesis.'),
    })
    .optional()
    .describe('Per-stage model overrides.'),
  concurrency: z
    .enum(['parallel', 'sequential', 'orchestrated'])
    .optional()
    .describe('How dimensions are scheduled.'),
  maxDecisions: z.number().int().min(1).max(50).optional().describe('Cap on agent decisions per dimension.'),
  language: z.enum(['fr', 'en']).optional().describe('Language of the streamed narration.'),
  batchId: z
    .string()
    .min(8)
    .max(80)
    .optional()
    .describe('Group several runs under one batch id; retrieve them with `/v1/readiness/batches/{batchId}`.'),
})

export const readinessLocalizeInput = z.object({
  lang: z.enum(['fr', 'en']).describe('Target language of the report.'),
})

export const readinessReportInput = z.object({
  format: z.enum(['markdown', 'html', 'docx']).describe('Report format.'),
  lang: z.enum(['fr', 'en']).optional().describe('Language of the report; French by default.'),
})

export const readinessWhatIfInput = z.object({
  country: z.string().length(2).describe('ISO 3166-1 alpha-2 country code.'),
  domain: z
    .enum(['health', 'education', 'telecom', 'public_services', 'agriculture'])
    .describe('Policy sector.'),
  changes: z
    .record(z.string(), z.number())
    .describe('Dimension short name to score delta. Positive raises the score, negative lowers it.'),
  scores: z
    .array(z.any())
    .optional()
    .describe('Optional baseline scores; absent runs a full assessment first.'),
})

/* ── Gazette ─────────────────────────────────────────────────────────────── */

export const gazetteAnalyzeInput = z.object({
  filename: z.string().min(1).max(200).describe('Original page filename, kept in the provenance.'),
  imageBase64: z.string().min(1).describe('Base64 page image; a data-URL prefix is tolerated.'),
  mime: z.enum(['image/png', 'image/jpeg']).optional().describe('Image MIME type.'),
  page: z.number().int().min(1).max(10_000).default(1).describe('Page number in the source document.'),
  sourceUrl: z.string().url().optional().describe('Canonical URL of the gazette issue.'),
  maxZones: z.number().int().min(1).max(48).default(24).describe('Maximum zones transcribed on the page.'),
  concurrency: z.number().int().min(1).max(8).default(4).describe('Vision calls performed in parallel.'),
})

export const gazetteIngestInput = z.object({
  page: z
    .custom<GazettePage>(
      (value) => {
        const candidate = value as Partial<GazettePage> | null
        return Boolean(candidate && typeof candidate.documentId === 'string' && Array.isArray(candidate.regions))
      },
      'Expected a page returned by /v1/gazette/analyze.',
    )
    .describe('Page object returned verbatim by `POST /v1/gazette/analyze`.'),
  country: countryOrGlobal,
  jurisdiction: jurisdictionInput.default('national'),
  subdivision: subdivisionInput,
  docType: z.string().default('regulation').describe('Document type used by retrieval filters.'),
  rights: corpusRights
    .default('official-text')
    .describe('Gazette pages are official texts; a caller may still send a stricter bucket.'),
  namespace: z.string().optional().describe('Corpus namespace.'),
  version: z.string().optional().describe('Version label.'),
})

/* ── Voice, actions, chat ────────────────────────────────────────────────── */

export const voiceCorrectBody = z.object({
  text: z.string().min(1).max(4000).describe('Raw transcript to punctuate and correct.'),
})

export const actionDecisionInput = z.object({
  decision: z.enum(['approve', 'reject']).describe('Operator decision on the proposed side effect.'),
})

export const chatSessionInput = z.object({
  title: z.string().min(1).max(200).describe('Session title shown in the console.'),
  turns: z
    .array(z.record(z.string(), z.unknown()))
    .max(200)
    .describe('Conversation turns, stored verbatim and capped at 200.'),
})

/* ── Impact ──────────────────────────────────────────────────────────────── */

export const impactAnalyzeInput = z.object({
  provision: z
    .object({
      title: z.string().min(1).max(300).describe('Provision title.'),
      text: z.string().min(1).max(20_000).describe('Provision text.'),
      articleNumber: z.string().max(80).optional().describe('Article number, when the instrument has one.'),
      docType: z.string().max(40).optional().describe('Document type of the instrument.'),
      sourceUrl: z.string().url().optional().describe('Canonical source URL.'),
      effectiveDate: z.string().max(40).optional().describe('Entry-into-force date, as written in the instrument.'),
    })
    .describe('The new provision whose impact is analysed.'),
  runIds: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .describe('Persisted scenario runs to re-open and rank against the provision.'),
})

/* ── WhatsApp and notifications ──────────────────────────────────────────── */

export const notifyInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('joint_report'),
    to: z.string().min(8).max(20).optional().describe('Recipient WhatsApp id; defaults to `WHATSAPP_RECIPIENT_WAID`.'),
    runId: z.string().min(1).max(120).describe('Scenario run the report belongs to.'),
    tick: z.number().int().min(0).describe('Tick number of the joint report.'),
    summary: z.string().min(1).max(900).describe('Report summary placed in the template.'),
    dryRun: z.boolean().default(false).describe('Build the payload without contacting Meta.'),
  }),
  z.object({
    kind: z.literal('deadline_alert'),
    to: z.string().min(8).max(20).optional().describe('Recipient WhatsApp id.'),
    title: z.string().min(1).max(200).describe('Alert title.'),
    deadline: z.string().min(1).max(120).describe('Deadline, as displayed to the recipient.'),
    actionUrl: z.string().url().optional().describe('Button target in the console.'),
    dryRun: z.boolean().default(false).describe('Build the payload without contacting Meta.'),
  }),
  z.object({
    kind: z.literal('approval_request'),
    to: z.string().min(8).max(20).optional().describe('Recipient WhatsApp id.'),
    runId: z.string().min(1).max(120).describe('Scenario run the approval applies to.'),
    summary: z.string().min(1).max(600).describe('What the recipient is asked to approve.'),
    expiresInMinutes: z
      .number()
      .int()
      .min(5)
      .max(10_080)
      .default(1_440)
      .describe('Signed-link lifetime, between five minutes and seven days.'),
    dryRun: z.boolean().default(false).describe('Build the payload without contacting Meta.'),
  }),
])

export const whatsappMessageInput = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(50).describe('Notification contacts to message.'),
  kind: z
    .enum(['test', 'joint_report', 'deadline_alert', 'approval_request'])
    .describe('Template to send.'),
  runId: z.string().min(1).max(120).optional().describe('Scenario run referenced by the template.'),
  tick: z.number().int().min(0).optional().describe('Tick referenced by a joint report.'),
  summary: z.string().min(1).max(900).optional().describe('Summary inserted in the template.'),
  title: z.string().min(1).max(200).optional().describe('Title inserted in the template.'),
  deadline: z.string().min(1).max(120).optional().describe('Deadline inserted in the template.'),
  actionUrl: z.string().url().optional().describe('Button target.'),
  expiresInMinutes: z
    .number()
    .int()
    .min(5)
    .max(10_080)
    .optional()
    .describe('Signed-link lifetime for an approval request.'),
})

export const emailMessageInput = z
  .object({
    contactIds: z.array(z.string().min(1)).min(1).max(50).describe('Notification contacts to e-mail.'),
    subject: z.string().trim().min(1).max(160).describe('Subject line.'),
    heading: z.string().trim().min(1).max(160).optional().describe('Heading displayed in the message body.'),
    intro: z.string().trim().max(300).optional().describe('Opening sentence.'),
    message: z.string().trim().min(1).max(5_000).describe('Body text.'),
    ctaLabel: z.string().trim().min(1).max(60).optional().describe('Call-to-action label; requires `ctaUrl`.'),
    ctaUrl: z.string().url().max(2_000).optional().describe('Call-to-action target; requires `ctaLabel`.'),
    locale: z.enum(['fr', 'en']).optional().describe('Language of the surrounding chrome.'),
  })
  .refine((value) => Boolean(value.ctaLabel) === Boolean(value.ctaUrl), {
    message: 'cta_incomplete',
    path: ['ctaUrl'],
  })

export const notificationContactInput = z.object({
  name: z.string().trim().min(1).max(120).describe('Contact display name.'),
  email: z.string().trim().email().max(200).optional().describe('E-mail address.'),
  phone: z.string().trim().min(4).max(40).optional().describe('Phone number; normalised to E.164.'),
  phoneCountry: z
    .string()
    .trim()
    .length(2)
    .optional()
    .describe('ISO 3166-1 alpha-2 country used to normalise the phone number; Cameroon by default.'),
  channels: z
    .object({
      email: z.boolean().describe('Consent to e-mail.'),
      whatsapp: z.boolean().describe('Consent to WhatsApp.'),
    })
    .optional()
    .describe('Per-channel consent; defaults to the channels that have an address.'),
})

export const summarySuggestionInput = z.object({
  runId: z.string().trim().min(1).max(120).describe('Scenario run to summarise.'),
  kind: z
    .enum(['joint_report', 'approval_request'])
    .default('joint_report')
    .describe('Tone of the suggestion: a situation update or an approval ask.'),
  locale: z.enum(['en', 'fr']).default('en').describe('Language of the suggestion.'),
})

/* ── Exercises ───────────────────────────────────────────────────────────── */

export const exerciseSampleQuery = z.object({
  country: z.string().min(2).max(2).default('cm').describe('ISO 3166-1 alpha-2 country code.'),
})

export const exerciseInjectInput = z.object({
  id: z.string().min(1).max(80).describe('Inject identifier, unique within the exercise.'),
  atMinute: z.number().int().min(0).max(1_440).describe('Minute at which the inject is released.'),
  title: z.string().min(1).max(200).describe('Inject title.'),
  detail: z.string().min(1).max(4_000).describe('Situation text shown to the players.'),
  visibleTo: z
    .array(z.string().min(1).max(80))
    .min(1)
    .max(20)
    .describe('Institutions that receive the inject.'),
  expectedAction: z.string().min(1).max(500).describe('Action the facilitator expects.'),
  responseWindowMinutes: z
    .number()
    .int()
    .min(1)
    .max(240)
    .optional()
    .describe('Minutes allowed to respond.'),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Inject severity.'),
})

export const exerciseDefinitionInput = z.object({
  id: z.string().min(1).max(120).describe('Exercise identifier.'),
  title: z.string().min(1).max(200).describe('Exercise title.'),
  country: z.string().min(2).max(2).describe('ISO 3166-1 alpha-2 country code.'),
  domain: z
    .enum(['health', 'education', 'telecom', 'public_services', 'agriculture'])
    .describe('Policy sector.'),
  scenarioRunId: z.string().min(1).max(120).optional().describe('Scenario run the exercise is built on.'),
  durationMinutes: z.number().int().min(5).max(480).describe('Exercise duration.'),
  injects: z.array(exerciseInjectInput).min(1).max(40).describe('Timed injects.'),
  references: z
    .array(
      z.object({
        title: z.string().min(1).max(300).describe('Reference title.'),
        authority: z.string().max(200).optional().describe('Issuing authority.'),
        documentId: z.string().max(120).optional().describe('Corpus document id.'),
      }),
    )
    .max(20)
    .optional()
    .describe('Documents the exercise relies on.'),
})

export const exerciseLogInput = z.object({
  id: z.string().min(1).max(80).optional().describe('Log entry identifier.'),
  atMinute: z.number().int().min(0).max(1_440).describe('Minute the action was taken.'),
  actor: z.string().min(1).max(120).describe('Institution or role that acted.'),
  kind: z.enum(['action', 'decision', 'escalation', 'note']).describe('Entry kind.'),
  text: z.string().min(1).max(2_000).describe('What was done.'),
  injectId: z.string().min(1).max(80).optional().describe('Inject the entry responds to.'),
})

export const exerciseBodyInput = z.object({
  definition: exerciseDefinitionInput.describe('Exercise definition.'),
  actions: z.array(exerciseLogInput).max(500).default([]).describe('Action log, in play order.'),
  evaluatedAtMinute: z
    .number()
    .int()
    .min(0)
    .max(1_440)
    .describe('Minute at which the exercise is evaluated.'),
  lang: z.enum(['fr', 'en']).default('en').describe('Language of the after-action report.'),
})

export const exerciseReportsQuery = z.object({
  exerciseId: z.string().min(1).max(120).describe('Exercise whose reports to list.'),
})

/* ── Observability ───────────────────────────────────────────────────────── */

export const usageQuery = z.object({
  from: z.string().datetime({ offset: true }).optional().describe('Window start, ISO-8601 with offset.'),
  to: z.string().datetime({ offset: true }).optional().describe('Window end, ISO-8601 with offset.'),
  /** Admin only: read another operator's scope. An operator may only repeat their own. */
  operator: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe('Admin only: read another operator’s rows.'),
  status: z.enum(['ok', 'error']).optional().describe('Only successful or failed calls.'),
  kind: z.enum(['chat', 'retrieval', 'image', 'voice', 'sam']).optional().describe('Capability to include.'),
  model: z.string().min(1).max(200).optional().describe('Restrict to one model id.'),
  route: z.string().min(1).max(300).optional().describe('Restrict to one API route.'),
  agentId: z.string().min(1).max(120).optional().describe('Restrict to one agent.'),
  limit: z.coerce.number().int().min(1).max(500).optional().describe('Maximum rows for the list endpoints.'),
})

export const observabilityEventsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50).describe('Maximum events to return.'),
})

/* ── Audit ───────────────────────────────────────────────────────────────── */

export const auditDossierQuery = z.object({
  format: z
    .enum(['json', 'markdown'])
    .default('json')
    .describe('`json` returns the dossier object; `markdown` returns a rendered document.'),
})

/* ── Responses worth publishing ──────────────────────────────────────────── */

export const healthResponse = z.object({
  status: z.literal('ok'),
  service: z.literal('sps-api'),
  provider: z.object({ mode: z.string(), model: z.string() }),
})

export const ingestResponse = z.object({
  ok: z.boolean().describe('`false` when the corpus refused the document.'),
  documentId: z.string().describe('Content-addressed document id.'),
  filename: z.string().describe('Stored filename.'),
  country: z.string().describe('Country the document was filed under.'),
  docType: z.string().describe('Document type.'),
  rights: corpusRightsSchema.describe('Rights recorded with the document.'),
  collection: z.string().describe('Retrieval collection.'),
  chunks: z.number().int().describe('Passages produced.'),
  inserted: z.number().int().describe('New passages written.'),
  unchanged: z.number().int().describe('Passages skipped because their content did not change.'),
  deactivated: z.number().int().describe('Passages retired because they disappeared from the document.'),
  characters: z.number().int().describe('Characters indexed.'),
  durationMs: z.number().int().describe('Server-side duration.'),
  error: z.string().optional().describe('Reason for a refusal.'),
})
