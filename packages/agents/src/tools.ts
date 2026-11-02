/**
 * Tools the policy agent can call while it answers.
 *
 * Read-only tools run and return their result to the model. Tools that need the
 * operator (a question, a file, a side effect) never act on their own: they
 * emit an interactive `ui` event and return "awaiting operator", so the model
 * stops for that step. Side effects are proposed as actions and executed only
 * once the operator approves them in the action center.
 */
import { tool, stepCountIs, type ToolSet } from 'ai'
import { z } from 'zod'
import type { AuditService } from '@sps/audit'
import type { Retriever } from '@sps/retrieval'
import type { KbChunk } from '@sps/shared'

import type { WebAnswer, WebSearch } from './web-search'

/**
 * A proposal is never a pause: the operator decides in the action center, and the
 * answer carries on in the same turn.
 */
const PROPOSED = {
  status: 'pending_approval' as const,
  next: 'Proposed to the operator. Continue your answer now and say the action is pending approval; do not wait for it.',
}

export type AgentActionKind = 'whatsapp_approval' | 'publish_communication' | 'record_gap' | 'request_tool' | 'delete_record'
export type AgentActionRisk = 'low' | 'medium' | 'high'

/** Stream events produced by the tools (forwarded to the console as SSE frames). */
/** What the agent can ask of the first-party MCP servers (implemented by the API). */
export interface McpPort {
  servers: string[]
  listTools(server: string): Promise<Array<{ name: string; description?: string }>>
  callTool(server: string, tool: string, args: Record<string, unknown>): Promise<{ result: unknown; uiResourceUri?: string }>
}

export type AgentToolEvent =
  | { type: 'tool'; phase: 'start' | 'end'; id: string; name: string; summary?: string; ok?: boolean }
  | {
      type: 'ui'
      ui:
        | { kind: 'ask_user'; id: string; question: string; options?: Array<{ id: string; label: string; description?: string }>; allowFreeText: boolean; multi: boolean }
        | { kind: 'request_input'; id: string; label: string; hint?: string; input: 'file' | 'text'; accept?: string }
        | { kind: 'approval'; id: string; action: AgentActionKind; title: string; summary: string; risk: AgentActionRisk; payload?: Record<string, unknown> }
        | { kind: 'mcp_app'; id: string; server: string; resourceUri: string; toolName: string; toolInput: Record<string, unknown>; toolResult: unknown }
    }

/** Entities the agent can read through `list_records` and `get_record`. */
export const DATA_ENTITIES = [
  'readiness_runs',
  'scenario_runs',
  'exercise_reports',
  'chat_sessions',
  'audit_events',
  'knowledge_documents',
  'countries',
] as const
export type DataEntity = (typeof DATA_ENTITIES)[number]

/** Records the agent may propose to delete. Deletion always waits for the operator. */
export const DELETABLE_ENTITIES = ['readiness_runs', 'scenario_runs', 'chat_sessions'] as const
export type DeletableEntity = (typeof DELETABLE_ENTITIES)[number]

/** What the agent can read and, once approved, delete: scoped to the operator. */
export interface DataPort {
  list(entity: DataEntity, options: { limit: number; country?: string; query?: string }): Promise<unknown[]>
  get(entity: DataEntity, id: string): Promise<unknown | null>
  remove(entity: DeletableEntity, id: string): Promise<boolean>
}

/** Where proposed side effects are stored until the operator decides. */
export interface ActionSink {
  propose(input: {
    kind: AgentActionKind
    title: string
    summary: string
    risk: AgentActionRisk
    payload?: Record<string, unknown>
    runId: string
    userId?: string
  }): Promise<{ id: string }>
}

export interface AgentToolContext {
  runId: string
  userId?: string
  institutionId: string
  country: string
  retriever: Retriever
  audit?: AuditService
  actions?: ActionSink
  mcp?: McpPort
  /** Live web search (Meta's `web_search`); absent when the provider offers none. */
  webSearch?: WebSearch
  /** Receives every web answer, so the assessment can carry its sources. */
  onWebAnswer?: (answer: WebAnswer) => void
  /** Receives the provisions each corpus search returned, so citations match what was actually read. */
  onCorpusChunks?: (chunks: KbChunk[]) => void
  /** Records the agent can read and propose to delete. */
  data?: DataPort
  emit: (event: AgentToolEvent) => void
}

/** Results are sent back to the model truncated: the full result is shown in the app card. */
const RESULT_CHARS = 6000

function clipped(value: unknown): unknown {
  const text = JSON.stringify(value) ?? ''
  return text.length > RESULT_CHARS ? { truncated: true, preview: text.slice(0, RESULT_CHARS) } : value
}

const SNIPPET = 240

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > SNIPPET ? `${flat.slice(0, SNIPPET)}…` : flat
}

function provisionOf(chunk: KbChunk) {
  return {
    filename: chunk.filename,
    article: chunk.articleNumber ?? null,
    heading: chunk.headingPath ?? null,
    quote: snippet(chunk.text),
  }
}

/**
 * Builds the tool set for one run. Every tool closes over the run context, so
 * events, audit records and proposed actions are always scoped to this operator.
 */
export function createAgentTools(ctx: AgentToolContext): ToolSet {
  const tools: ToolSet = {
    search_corpus: tool({
      description:
        'Search the indexed national corpus for provisions relevant to a query. Use it before stating any rule, and again with other words when the first results do not answer the question.',
      inputSchema: z.object({
        query: z.string().min(2).max(300),
        topK: z.number().int().min(1).max(12).optional(),
      }),
      execute: async ({ query, topK }) => {
        // The assistant gets the deepest search: parallel sub-agents and judge loops.
        const chunks = await ctx.retriever.search({ text: query, country: ctx.country, topK: topK ?? 6, depth: 'deep' })
        ctx.onCorpusChunks?.(chunks)
        return { count: chunks.length, provisions: chunks.map(provisionOf) }
      },
    }),

    ...(ctx.data
      ? {
          list_records: tool({
            description:
              'List records of the operator\'s workspace. entity: readiness_runs (AI-readiness assessments), scenario_runs (crisis simulations), exercise_reports (after-action reports), chat_sessions (saved conversations), audit_events (the audit trail, newest first), knowledge_documents (indexed documents), countries (the registry). Use country or query to narrow the list when the question names one.',
            inputSchema: z.object({
              entity: z.enum(DATA_ENTITIES),
              limit: z.number().int().min(1).max(25).optional(),
              country: z.string().min(2).max(3).optional(),
              query: z.string().max(120).optional(),
            }),
            execute: async ({ entity, limit, country, query }) => {
              const records = await ctx.data!.list(entity, { limit: limit ?? 10, ...(country ? { country } : {}), ...(query ? { query } : {}) })
              return clipped({ entity, count: records.length, records })
            },
          }),

          get_record: tool({
            description:
              'Read one record in full, by id, with the entity names of list_records. Use it to answer a question about a specific assessment, run, report or conversation.',
            inputSchema: z.object({ entity: z.enum(DATA_ENTITIES), id: z.string().min(1).max(120) }),
            execute: async ({ entity, id }) => {
              const record = await ctx.data!.get(entity, id)
              return record ? clipped({ entity, found: true, record }) : { entity, found: false }
            },
          }),
        }
      : {}),

    ...(ctx.data && ctx.actions
      ? {
          propose_deletion: tool({
            description:
              'Propose to delete one record: a readiness assessment, a crisis simulation run or a saved conversation. Only the operator can delete: the card waits for approval, and you must say the deletion is pending, never done.',
            inputSchema: z.object({
              entity: z.enum(DELETABLE_ENTITIES),
              id: z.string().min(1).max(120),
              reason: z.string().min(5).max(300),
            }),
            execute: async (input) => {
              const { id: actionId } = await ctx.actions!.propose({
                kind: 'delete_record',
                title: `Delete ${input.entity} ${input.id}`,
                summary: input.reason,
                risk: 'high',
                payload: { entity: input.entity, id: input.id },
                runId: ctx.runId,
                ...(ctx.userId ? { userId: ctx.userId } : {}),
              })
              ctx.emit({
                type: 'ui',
                ui: {
                  kind: 'approval',
                  id: actionId,
                  action: 'delete_record',
                  title: `Delete ${input.entity} ${input.id}`,
                  summary: input.reason,
                  risk: 'high',
                  payload: { entity: input.entity, id: input.id },
                },
              })
              return { ...PROPOSED, actionId }
            },
          }),
        }
      : {}),

    ...(ctx.webSearch
      ? {
          search_web: tool({
            description:
              'Search the live web for information that may have changed: recent announcements, current rules, dates, figures. Use it only when the corpus cannot answer or may be out of date. Web results are NOT legal sources: say they come from the web and give the URL; never quote them as the law.',
            inputSchema: z.object({ query: z.string().min(3).max(300) }),
            execute: async ({ query }) => {
              const answer = await ctx.webSearch!(query)
              ctx.onWebAnswer?.(answer)
              return {
                source: 'web',
                text: answer.text.slice(0, RESULT_CHARS),
                sources: answer.sources.slice(0, 8).map((source) => ({ title: source.title, url: source.url })),
              }
            },
          }),
        }
      : {}),

    record_gap: tool({
      description:
        'Propose to record a gap: a question the corpus cannot answer, or a provision that is missing. The gap appears in the action center and enters the audit trail only once the operator approves it.',
      inputSchema: z.object({
        description: z.string().min(5).max(400),
        severity: z.enum(['low', 'medium', 'high', 'critical']),
      }),
      execute: async ({ description, severity }) => {
        if (!ctx.actions) return { status: 'unavailable', reason: 'No action store on this deployment.' }
        const risk: AgentActionRisk = severity === 'low' ? 'low' : severity === 'medium' ? 'medium' : 'high'
        const title = `Gap · ${severity}`
        const { id } = await ctx.actions.propose({
          kind: 'record_gap',
          title,
          summary: description,
          risk,
          payload: { severity, description },
          runId: ctx.runId,
          ...(ctx.userId ? { userId: ctx.userId } : {}),
        })
        ctx.emit({
          type: 'ui',
          ui: { kind: 'approval', id, action: 'record_gap', title, summary: description, risk, payload: { severity } },
        })
        return { ...PROPOSED, actionId: id }
      },
    }),

    ask_user: tool({
      description:
        'Ask the operator a question when the answer depends on a choice only they can make (jurisdiction, period, population). Provide options when the choices are known. Stop after calling it: the answer comes in the next message.',
      inputSchema: z.object({
        question: z.string().min(5).max(300),
        options: z
          .array(z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(120), description: z.string().max(200).optional() }))
          .max(6)
          .optional(),
        allowFreeText: z.boolean().default(true),
        multi: z.boolean().default(false),
      }),
      execute: async (input, { toolCallId }) => {
        ctx.emit({
          type: 'ui',
          ui: {
            kind: 'ask_user',
            id: toolCallId,
            question: input.question,
            ...(input.options ? { options: input.options } : {}),
            allowFreeText: input.allowFreeText,
            multi: input.multi,
          },
        })
        return { status: 'awaiting_operator_answer' }
      },
    }),

    request_input: tool({
      description:
        'Ask the operator to provide something the corpus does not have: a document to attach (input "file") or a value to type (input "text"). Stop after calling it.',
      inputSchema: z.object({
        label: z.string().min(3).max(160),
        hint: z.string().max(240).optional(),
        input: z.enum(['file', 'text']),
        accept: z.string().max(120).optional(),
      }),
      execute: async (input, { toolCallId }) => {
        ctx.emit({
          type: 'ui',
          ui: {
            kind: 'request_input',
            id: toolCallId,
            label: input.label,
            ...(input.hint ? { hint: input.hint } : {}),
            input: input.input,
            ...(input.accept ? { accept: input.accept } : {}),
          },
        })
        return { status: 'awaiting_operator_input' }
      },
    }),

    request_approval: tool({
      description:
        'Propose a side effect that needs the operator approval first: a WhatsApp approval request, or the approval of a public communication. Nothing is sent until the operator approves it in the card.',
      inputSchema: z.object({
        action: z.enum(['whatsapp_approval', 'publish_communication']),
        title: z.string().min(3).max(160),
        summary: z.string().min(5).max(600),
        risk: z.enum(['low', 'medium', 'high']),
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: async (input) => {
        if (!ctx.actions) return { status: 'unavailable', reason: 'No action store on this deployment.' }
        const { id } = await ctx.actions.propose({
          kind: input.action,
          title: input.title,
          summary: input.summary,
          risk: input.risk,
          ...(input.payload ? { payload: input.payload } : {}),
          runId: ctx.runId,
          ...(ctx.userId ? { userId: ctx.userId } : {}),
        })
        ctx.emit({
          type: 'ui',
          ui: {
            kind: 'approval',
            id,
            action: input.action,
            title: input.title,
            summary: input.summary,
            risk: input.risk,
            ...(input.payload ? { payload: input.payload } : {}),
          },
        })
        return { ...PROPOSED, actionId: id }
      },
    }),

    mcp_list_tools: tool({
        description:
          'List the tools exposed by one first-party MCP server (charts, 3D render, diagrams, games). Call it before mcp_call_tool when you do not know the tool name.',
        inputSchema: z.object({ server: z.string().min(2).max(60) }),
        execute: async ({ server }) => {
          if (!ctx.mcp) return { status: 'unavailable', reason: 'No MCP servers on this deployment.' }
          if (!ctx.mcp.servers.includes(server)) return { status: 'unknown_server', servers: ctx.mcp.servers }
          const tools = await ctx.mcp.listTools(server)
          return { server, tools: tools.slice(0, 40) }
        },
      }),

    mcp_call_tool: tool({
        description:
          'Call a tool of a first-party MCP server, for example to draw a chart or a 3D render. When the server returns an interactive app, the operator sees it in the answer.',
        inputSchema: z.object({
          server: z.string().min(2).max(60),
          tool: z.string().min(1).max(120),
          arguments: z.record(z.string(), z.unknown()).optional(),
        }),
        execute: async ({ server, tool: name, arguments: args }, { toolCallId }) => {
          if (!ctx.mcp) return { status: 'unavailable', reason: 'No MCP servers on this deployment.' }
          if (!ctx.mcp.servers.includes(server)) return { status: 'unknown_server', servers: ctx.mcp.servers }
          const input = args ?? {}
          const { result, uiResourceUri } = await ctx.mcp.callTool(server, name, input)
          if (uiResourceUri) {
            ctx.emit({
              type: 'ui',
              ui: {
                kind: 'mcp_app',
                id: toolCallId,
                server,
                resourceUri: uiResourceUri,
                toolName: name,
                toolInput: input,
                toolResult: result,
              },
            })
          }
          return clipped(result)
        },
      }),

    request_tool: tool({
      description:
        'Request permission to run a tool the agent cannot run by itself (for example sending the WhatsApp approval request for the current run). The operator approves or refuses in the card.',
      inputSchema: z.object({
        toolName: z.enum(['send_whatsapp_approval']),
        reason: z.string().min(5).max(400),
        args: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: async (input) => {
        if (!ctx.actions) return { status: 'unavailable', reason: 'No action store on this deployment.' }
        const { id } = await ctx.actions.propose({
          kind: 'request_tool',
          title: `Run ${input.toolName}`,
          summary: input.reason,
          risk: 'medium',
          payload: { toolName: input.toolName, ...(input.args ?? {}) },
          runId: ctx.runId,
          ...(ctx.userId ? { userId: ctx.userId } : {}),
        })
        ctx.emit({
          type: 'ui',
          ui: {
            kind: 'approval',
            id,
            action: 'request_tool',
            title: `Run ${input.toolName}`,
            summary: input.reason,
            risk: 'medium',
            payload: { toolName: input.toolName },
          },
        })
        return { ...PROPOSED, actionId: id }
      },
    }),
  }
  return tools
}

/** Trail label for a tool call, in the operator's language is handled by the console. */
export function summarizeToolInput(name: string, input: unknown): string {
  const value = (input ?? {}) as Record<string, unknown>
  if (name === 'search_corpus') return String(value.query ?? '')
  if (name === 'record_gap') return String(value.severity ?? '')
  if (name === 'mcp_list_tools') return String(value.server ?? '')
  if (name === 'mcp_call_tool') return `${String(value.server ?? '')} · ${String(value.tool ?? '')}`
  if (name === 'list_records' || name === 'get_record') return `${String(value.entity ?? '')}${value.id ? ` · ${String(value.id)}` : ''}`
  if (name === 'propose_deletion') return `${String(value.entity ?? '')} · ${String(value.id ?? '')}`
  if (name === 'request_approval' || name === 'request_input' || name === 'ask_user') return String(value.question ?? value.label ?? value.title ?? '')
  return ''
}

export { stepCountIs }
