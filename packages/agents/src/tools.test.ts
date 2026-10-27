import { describe, expect, test } from 'bun:test'
import { INSTITUTIONS, type InstitutionSpec, type KbChunk } from '@sps/shared'
import type { Retriever } from '@sps/retrieval'
import type { LanguageModel } from 'ai'
import { PolicyOrchestrator } from './orchestrator'
import type { ActionSink, AgentToolEvent } from './tools'

const PROVISION = 'Tout traitement de données de santé doit être autorisé par la personne concernée.'
const chunk: KbChunk = {
  id: 'c1',
  filename: 'loi_2024_protection_donnees.pdf',
  text: PROVISION,
  chunkIndex: 0,
  country: 'cm',
  jurisdiction: 'national',
  docType: 'law',
  articleNumber: '12',
  headingPath: 'TITRE I > ARTICLE 12',
  isActive: true,
}
const institution: InstitutionSpec = INSTITUTIONS.find((i) => i.id === 'data_protection_authority') ?? INSTITUTIONS[0]!
const retriever = { search: async () => [chunk] } as unknown as Retriever

/** A model that calls one tool on its first step, then answers. */
function toolModel(toolName: string, input: unknown, answer: string): LanguageModel {
  let step = 0
  return {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'test-tools',
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('buffered path not expected')
    },
    doStream: async () => {
      const current = step++
      const parts: unknown[] =
        current === 0
          ? [{ type: 'tool-call', toolCallId: 'call-1', toolName, input: JSON.stringify(input) }]
          : [
              { type: 'text-start', id: 't1' },
              { type: 'text-delta', id: 't1', delta: answer },
              { type: 'text-end', id: 't1' },
            ]
      const finish = {
        type: 'finish',
        finishReason: { unified: current === 0 ? 'tool-calls' : 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
      }
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] })
            for (const part of parts) controller.enqueue(part)
            controller.enqueue(finish)
            controller.close()
          },
        }),
      }
    },
  } as unknown as LanguageModel
}

const input = {
  institution,
  question: 'Faut-il le consentement ?',
  country: 'cm',
  domain: 'health' as const,
  lens: 'hybrid' as const,
  runId: 'run-tools',
  userId: 'ada@sps.dev',
  withTools: true,
}

describe('agent tools', () => {
  test('ask_user emits an interactive card and the trail shows the call', async () => {
    const model = toolModel('ask_user', { question: 'Quelle juridiction ?', options: [{ id: 'nat', label: 'National' }], allowFreeText: true, multi: false }, 'Je dois savoir laquelle.')
    const orchestrator = new PolicyOrchestrator({ model, retriever })
    const trail: AgentToolEvent[] = []
    const cards: unknown[] = []
    await orchestrator.streamAgent(input, {
      onDelta: () => undefined,
      onTool: (event) => trail.push(event),
      onUi: (ui) => cards.push(ui),
    })
    expect(trail.map((e) => (e.type === 'tool' ? `${e.phase}:${e.name}` : e.type))).toEqual(['start:ask_user', 'end:ask_user'])
    expect(cards).toEqual([
      expect.objectContaining({ kind: 'ask_user', id: 'call-1', question: 'Quelle juridiction ?', allowFreeText: true, multi: false }),
    ])
  })

  test('a proposed side effect is stored, never executed, until the operator decides', async () => {
    const proposals: Array<{ kind: string; runId: string }> = []
    const actions: ActionSink = {
      propose: async (proposal) => {
        proposals.push({ kind: proposal.kind, runId: proposal.runId })
        return { id: 'act_1' }
      },
    }
    const model = toolModel(
      'request_approval',
      { action: 'whatsapp_approval', title: 'Notifier le ministère', summary: 'Demande de validation', risk: 'medium' },
      'Une validation est demandée.',
    )
    const orchestrator = new PolicyOrchestrator({ model, retriever })
    const cards: Array<{ kind: string; id?: string }> = []
    await orchestrator.streamAgent({ ...input, actions }, {
      onDelta: () => undefined,
      onUi: (ui) => cards.push(ui as { kind: string; id?: string }),
    })
    expect(proposals).toEqual([{ kind: 'whatsapp_approval', runId: 'run-tools' }])
    expect(cards).toEqual([expect.objectContaining({ kind: 'approval', id: 'act_1' })])
  })

  test('an MCP tool that renders an app emits an mcp_app card, and the model gets the result', async () => {
    const model = toolModel('mcp_call_tool', { server: 'sarkiai_charts', tool: 'bar_chart', arguments: { values: [1, 2] } }, 'Voici le graphique.')
    const orchestrator = new PolicyOrchestrator({ model, retriever })
    const cards: Array<{ kind: string; resourceUri?: string; server?: string }> = []
    const calls: string[] = []
    const mcp = {
      servers: ['sarkiai_charts'],
      listTools: async () => [],
      callTool: async (server: string, tool: string) => {
        calls.push(`${server}/${tool}`)
        return { result: { content: [{ type: 'text', text: 'ok' }] }, uiResourceUri: 'ui://charts/bar' }
      },
    }
    await orchestrator.streamAgent({ ...input, mcp }, {
      onDelta: () => undefined,
      onUi: (ui) => cards.push(ui as { kind: string; resourceUri?: string; server?: string }),
    })
    expect(calls).toEqual(['sarkiai_charts/bar_chart'])
    expect(cards).toEqual([expect.objectContaining({ kind: 'mcp_app', server: 'sarkiai_charts', resourceUri: 'ui://charts/bar' })])
  })
})
