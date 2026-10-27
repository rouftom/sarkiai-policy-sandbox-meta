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

export type AgentActionKind = 'whatsapp_approval' | 'publish_communication' | 'record_gap' | 'request_tool'
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
        const chunks = await ctx.retriever.search({ text: query, country: ctx.country, topK: topK ?? 6 })
        return { count: chunks.length, provisions: chunks.map(provisionOf) }
      },
    }),

    record_gap: tool({
      description:
        'Record a gap: a question the corpus cannot answer, or a provision that is missing. The gap goes into the audit trail. Nothing is published.',
      inputSchema: z.object({
        description: z.string().min(5).max(400),
        severity: z.enum(['low', 'medium', 'high', 'critical']),
      }),
      execute: async ({ description, severity }) => {
        await ctx.audit?.logAction({
          actor: ctx.institutionId,
          action: 'gap.recorded',
          target: `${severity}: ${description}`,
          lens: 'hybrid',
          runId: ctx.runId,
          ...(ctx.userId ? { userId: ctx.userId } : {}),
        })
        return { recorded: true, severity }
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
        return { status: 'pending_approval', actionId: id }
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
        return { status: 'pending_approval', actionId: id }
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
  if (name === 'request_approval' || name === 'request_input' || name === 'ask_user') return String(value.question ?? value.label ?? value.title ?? '')
  return ''
}

export { stepCountIs }
