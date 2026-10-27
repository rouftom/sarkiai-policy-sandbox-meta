import { describe, expect, test } from 'bun:test'
import type { LanguageModel } from 'ai'
import {
  buildCommunicationPrompt,
  CommunicationPolicyError,
  COMMUNICATION_LANGUAGES,
  draftCommunication,
  isCommunicationLanguage,
  parseCommunicationDraft,
  scanPublicDraft,
  unverifiedNumbers,
  type CommunicationRequest,
} from './communication.js'

const request: CommunicationRequest = {
  language: 'ff',
  sourceLanguage: 'en',
  audience: 'Residents of the Adamawa region',
  jurisdiction: 'Cameroon',
  incidentSummary:
    'A waterborne illness cluster was reported in three health centres. The Ministry of Health is investigating. Boil drinking water until further notice.',
  channels: ['radio', 'sms'],
}

const draftJson = JSON.stringify({
  title: 'Habaru cellal',
  summary: 'Official notice about the waterborne illness investigation in three health centres.',
  message: 'Yimɓe Adamawa, ndiyam ɓiɗɗam heɓii nyau. Ministeer cellal ina wiɗta. Rentu ndiyam ɓiɗɗam haa habaru garoo.',
  sms: 'Rentu ndiyam. Ministeer cellal ina wiɗta nyau nder Adamawa.',
  keyTerms: [{ term: 'health centre', translation: 'safari cellal' }],
  caveats: ['Check the place names with the regional delegation.'],
})

describe('language contract', () => {
  test('only Fulfulde and Hausa are accepted', () => {
    expect(isCommunicationLanguage('ff')).toBe(true)
    expect(isCommunicationLanguage('ha')).toBe(true)
    expect(isCommunicationLanguage('fr')).toBe(false)
    expect(COMMUNICATION_LANGUAGES.ff.name).toBe('Fulfulde')
    expect(COMMUNICATION_LANGUAGES.ha.name).toBe('Hausa')
  })

  test('the prompt fixes the language, the facts and the review duty', () => {
    const prompt = buildCommunicationPrompt({ ...request, language: 'ha' })
    expect(prompt).toContain('Hausa')
    expect(prompt).toContain('Boko (Latin)')
    expect(prompt).toContain('Residents of the Adamawa region')
    expect(prompt).toContain('three health centres')
    expect(prompt).toContain('native speaker')
    expect(prompt).toContain('Do not give medical advice')
    expect(prompt).toContain('Return JSON only')
  })
})

describe('policy gate', () => {
  test('blocks political content, including Hausa loanwords', () => {
    expect(scanPublicDraft('Vote for our candidate next week.')).toHaveLength(1)
    expect(scanPublicDraft('Zaɓe na gabatowa.')).toHaveLength(1)
    expect(scanPublicDraft('Siyasa ba ta shiga wannan sanarwa ba.')).toHaveLength(1)
  })

  test('blocks medical advice and blame, but accepts a factual notice', () => {
    expect(scanPublicDraft('Take 2 tablets of this drug every day.')).toHaveLength(1)
    expect(scanPublicDraft('The hospital is responsible for the breach.')).toHaveLength(1)
    expect(scanPublicDraft('The Ministry of Health is investigating the cluster in three health centres.')).toEqual([])
  })

  test('flags phone numbers that are absent from the verified facts', () => {
    expect(unverifiedNumbers('Call +237 6 99 00 11 22 now.', request.incidentSummary)).toEqual(['+237 6 99 00 11 22'])
    expect(unverifiedNumbers('Call the Ministry.', request.incidentSummary)).toEqual([])
    expect(unverifiedNumbers('Three centres, 14 cases.', 'Three centres, 14 cases.')).toEqual([])
  })
})

describe('parsing and drafting', () => {
  test('tolerates a fenced payload and trims empty key terms', () => {
    const parsed = parseCommunicationJson(`\`\`\`json\n${JSON.stringify({ ...JSON.parse(draftJson), keyTerms: [{}, { term: 'a', translation: 'b' }, { term: '', translation: 'c' }] })}\n\`\`\``)
    expect(parsed.message).toContain('Rentu')
    expect(parsed.keyTerms).toEqual([{ term: 'a', translation: 'b' }])
  })

  test('rejects an empty or malformed draft', () => {
    expect(() => parseCommunicationDraft('not json')).toThrow('did not return JSON')
    expect(() => parseCommunicationDraft('{"title":"x"}')).toThrow('no message')
  })

  test('marks every draft as pending native review', async () => {
    const draft = await draftCommunication({
      model: {} as LanguageModel,
      modelLabel: 'muse-spark-1.3',
      request,
      deps: { generate: async () => draftJson },
    })
    expect(draft.language).toBe('ff')
    expect(draft.languageName).toBe('Fulfulde')
    expect(draft.reviewStatus).toBe('pending_native_review')
    expect(draft.reviewRequired).toBe(true)
    expect(draft.warnings[0]).toContain('Native-speaker review')
    expect(draft.model).toBe('muse-spark-1.3')
  })

  test('warns on an invented hotline without blocking the draft', async () => {
    const draft = await draftCommunication({
      model: {} as LanguageModel,
      modelLabel: 'muse-spark-1.3',
      request,
      deps: {
        generate: async () =>
          JSON.stringify({
            ...JSON.parse(draftJson),
            message: `${JSON.parse(draftJson).message} Call +237 6 55 44 33 22.`,
          }),
      },
    })
    expect(draft.warnings.some((warning) => warning.includes('not in the verified facts'))).toBe(true)
  })

  test('throws when the model drafts political content', async () => {
    await expect(
      draftCommunication({
        model: {} as LanguageModel,
        modelLabel: 'muse-spark-1.3',
        request,
        deps: {
          generate: async () =>
            JSON.stringify({ ...JSON.parse(draftJson), message: 'Vote for the party candidate.' }),
        },
      }),
    ).rejects.toBeInstanceOf(CommunicationPolicyError)
  })

  test('refuses an unsupported language before calling the model', async () => {
    let called = false
    await expect(
      draftCommunication({
        model: {} as LanguageModel,
        modelLabel: 'muse-spark-1.3',
        request: { ...request, language: 'fr' as never },
        deps: {
          generate: async () => {
            called = true
            return draftJson
          },
        },
      }),
    ).rejects.toThrow('Unsupported communication language')
    expect(called).toBe(false)
  })
})

function parseCommunicationJson(value: string) {
  return parseCommunicationDraft(value)
}
