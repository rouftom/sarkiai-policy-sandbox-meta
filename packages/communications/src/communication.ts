/**
 * N9 · public-communication drafts in Fulfulde or Hausa.
 *
 * The engine never publishes. It produces a draft in the target language, flags
 * it `pending_native_review`, and refuses to emit political content or medical
 * advice. A native speaker remains the only person who can approve the language;
 * the API cannot certify fluency it does not have.
 *
 * The deterministic layer is the guardrail: `scanPublicDraft` runs on the model
 * output after generation and can reject it. Model choice and prompt quality only
 * affect usefulness, never the safety gate.
 */

import { generateText, type LanguageModel } from 'ai'

export type CommunicationLanguage = 'ff' | 'ha'

export interface LanguageProfile {
  code: CommunicationLanguage
  name: string
  script: string
  region: string
  note: string
}

export const COMMUNICATION_LANGUAGES: Record<CommunicationLanguage, LanguageProfile> = {
  ff: {
    code: 'ff',
    name: 'Fulfulde',
    script: 'Latin (Adamawa variants may use modified letters)',
    region: 'West and Central Africa',
    note: 'Prefer the vocabulary used by local radio; keep place and institution names unchanged.',
  },
  ha: {
    code: 'ha',
    name: 'Hausa',
    script: 'Boko (Latin)',
    region: 'southern Niger, northern Nigeria',
    note: 'Prefer plain Hausa used on radio; keep place and institution names unchanged.',
  },
}

export function isCommunicationLanguage(value: string): value is CommunicationLanguage {
  return value === 'ff' || value === 'ha'
}

export interface CommunicationRequest {
  language: CommunicationLanguage
  /** Language of the source facts, not of the draft. */
  sourceLanguage: 'en' | 'fr'
  audience: string
  jurisdiction: string
  /** Verified incident facts only. The model must not add any. */
  incidentSummary: string
  channels?: Array<'radio' | 'sms' | 'social' | 'press'>
  constraints?: string[]
}

export interface KeyTerm {
  term: string
  translation: string
}

export interface CommunicationDraft {
  language: CommunicationLanguage
  languageName: string
  script: string
  /** Always pending: the engine cannot approve a language it does not speak. */
  reviewStatus: 'pending_native_review'
  reviewRequired: true
  title: string
  /** One English sentence describing the draft, for the reviewer's queue. */
  summary: string
  message: string
  sms: string
  keyTerms: KeyTerm[]
  caveats: string[]
  /** Things a reviewer must check before publication. */
  warnings: string[]
  model: string
  generatedAt: string
}

export interface DraftCommunicationInput {
  model: LanguageModel
  modelLabel: string
  request: CommunicationRequest
  maxOutputTokens?: number
  /** Inject a fake generator in tests. */
  deps?: { generate?: (prompt: string) => Promise<string> }
}

export class CommunicationPolicyError extends Error {
  readonly violations: string[]

  constructor(violations: string[]) {
    super(`Draft rejected by the public-communication policy: ${violations.join(' ')}`)
    this.name = 'CommunicationPolicyError'
    this.violations = violations
  }
}

interface Rule {
  id: string
  pattern: RegExp
  message: string
}

/**
 * Politics and medical advice are hard blocks; the multilingual terms catch the
 * likely loanwords in the target languages, not only English.
 */
const FORBIDDEN: Rule[] = [
  {
    id: 'political',
    pattern:
      /\b(elections?|vot(e|ing)|ballots?|candidates?|political|politician|parties|siyasa|siyaasa|za[ɓb]e|zabe|su[ɓb]aade)\b/iu,
    message: 'Political content is out of scope for this engine.',
  },
  {
    id: 'medical_advice',
    pattern:
      /\b(diagnos\w*|prescri\w*|dosage|self-medicat\w*|take \d+\s*(?:mg|ml|tablets?)|magani\s+kai)\b/iu,
    message: 'The draft must not give medical advice.',
  },
  {
    id: 'blame',
    pattern: /\b(to blame|blame (?:the|a|an)|fault of|responsible for the (?:leak|breach))\b/iu,
    message: 'The draft must not assign blame before an investigation concludes.',
  },
]

/** Returns human-readable violations; empty means safe to show as a draft. */
export function scanPublicDraft(text: string): string[] {
  return FORBIDDEN.filter((rule) => rule.pattern.test(text)).map((rule) => rule.message)
}

/** Phone-like numbers present in the draft but not in the verified facts. */
export function unverifiedNumbers(draft: string, source: string): string[] {
  const sourceDigits = new Set(source.match(/\d{6,}/g) ?? [])
  return [...new Set(draft.match(/\+?\d[\d\s().-]{5,}\d/g) ?? [])].filter((value) => {
    const digits = value.replace(/\D/g, '')
    return digits.length >= 6 && !sourceDigits.has(digits)
  })
}

export function buildCommunicationPrompt(request: CommunicationRequest): string {
  const language = COMMUNICATION_LANGUAGES[request.language]
  const channels = request.channels?.length ? request.channels : ['radio', 'sms', 'social']
  const constraints = request.constraints?.length ? request.constraints : ['Keep the tone factual and calm.']

  return [
    'You are a public-health communication officer drafting an official message for a national institution.',
    'You draft; you never publish. A native speaker will review every word before release.',
    '',
    `Draft a public communication in ${language.name} (${language.script}) for ${language.region}.`,
    'Write only in the target language. Keep institution names, place names and figures exactly as given.',
    'Do not give medical advice. Do not discuss politics, elections, parties or candidates. Do not blame a person or an institution.',
    'Do not invent a hotline, a website, a case count or a legal deadline. If a contact is needed, write the literal placeholder [hotline] and flag it in caveats.',
    '',
    `AUDIENCE: ${request.audience}`,
    `JURISDICTION: ${request.jurisdiction}`,
    `CHANNELS: ${channels.join(', ')}`,
    `CONSTRAINTS: ${constraints.join(' | ')}`,
    '',
    'VERIFIED FACTS (the only facts you may use):',
    request.incidentSummary,
    '',
    'Return JSON only, no prose and no code fence:',
    '{"title":"radio-ready headline","summary":"one English sentence describing the draft","message":"90-word radio-ready target-language message","sms":"one target-language SMS under 320 characters","keyTerms":[{"term":"English term","translation":"target-language term you used"}],"caveats":["what the native reviewer must verify"]}',
  ].join('\n')
}

interface RawDraft {
  title?: unknown
  summary?: unknown
  message?: unknown
  sms?: unknown
  keyTerms?: unknown
  caveats?: unknown
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : []
}

function asKeyTerms(value: unknown): KeyTerm[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const entry = item as { term?: unknown; translation?: unknown }
    const term = asString(entry.term)
    const translation = asString(entry.translation)
    return term && translation ? [{ term, translation }] : []
  })
}

/** Tolerant JSON parse; an empty draft is a hard failure, not a silent blank. */
export function parseCommunicationDraft(raw: string): Omit<CommunicationDraft, 'language' | 'languageName' | 'script' | 'model' | 'generatedAt' | 'reviewStatus' | 'reviewRequired' | 'warnings'> {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('The communication draft did not return JSON.')

  let payload: RawDraft
  try {
    payload = JSON.parse(raw.slice(start, end + 1)) as RawDraft
  } catch {
    throw new Error('The communication draft returned invalid JSON.')
  }

  const message = asString(payload.message)
  if (!message) throw new Error('The communication draft has no message.')

  return {
    title: asString(payload.title) || message.slice(0, 80),
    summary: asString(payload.summary) || '',
    message,
    sms: asString(payload.sms) || message.slice(0, 320),
    keyTerms: asKeyTerms(payload.keyTerms),
    caveats: asStringArray(payload.caveats),
  }
}

export async function draftCommunication(input: DraftCommunicationInput): Promise<CommunicationDraft> {
  const request = input.request
  if (!isCommunicationLanguage(request.language)) {
    throw new Error(`Unsupported communication language "${String(request.language)}". Use ff (Fulfulde) or ha (Hausa).`)
  }
  if (!request.incidentSummary.trim()) throw new Error('A communication draft needs verified facts.')
  if (!request.audience.trim()) throw new Error('A communication draft needs an audience.')

  const prompt = buildCommunicationPrompt(request)
  let raw = ''
  if (input.deps?.generate) {
    raw = await input.deps.generate(prompt)
  } else {
    const result = await generateText({
      model: input.model,
      prompt,
      temperature: 0.3,
      maxOutputTokens: input.maxOutputTokens ?? 1200,
    })
    raw = result.text
  }

  const parsed = parseCommunicationDraft(raw)
  const fullText = [parsed.title, parsed.message, parsed.sms, ...parsed.caveats].join('\n')
  const violations = scanPublicDraft(fullText)
  if (violations.length > 0) throw new CommunicationPolicyError(violations)

  const language = COMMUNICATION_LANGUAGES[request.language]
  const warnings = [
    'Native-speaker review is required before publication.',
    ...unverifiedNumbers(fullText, request.incidentSummary).map(
      (value) => `Phone-like value "${value}" is not in the verified facts.`,
    ),
  ]

  return {
    language: request.language,
    languageName: language.name,
    script: language.script,
    reviewStatus: 'pending_native_review',
    reviewRequired: true,
    ...parsed,
    warnings,
    model: input.modelLabel,
    generatedAt: new Date().toISOString(),
  }
}
