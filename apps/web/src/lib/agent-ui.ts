/**
 * Contract between the agent stream and the interactive cards.
 *
 * The API emits `ui` events on the answer stream; the console renders them with
 * the components in `components/ai/tools` and answers them through the routes
 * documented below. Keep this file the only place where the shapes live.
 */

/** The operator must choose or type an answer. Answered in the next turn. */
export interface AskUserRequest {
  kind: 'ask_user'
  id: string
  question: string
  options?: Array<{ id: string; label: string; description?: string }>
  allowFreeText: boolean
  multi: boolean
}

/** The operator must provide a file or a value. Answered in the next turn. */
export interface RequestInputRequest {
  kind: 'request_input'
  id: string
  label: string
  hint?: string
  input: 'file' | 'text'
  accept?: string
}

export type ActionRisk = 'low' | 'medium' | 'high'

/** Kinds of side effects an agent may propose. Each one has a server handler. */
export type ActionKind =
  | 'whatsapp_approval'
  | 'publish_communication'
  | 'record_gap'
  | 'request_tool'
  | 'delete_record'

export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'

/** Proposed side effect waiting for the operator (tool confirmation card). */
export interface ApprovalRequest {
  kind: 'approval'
  id: string
  action: ActionKind
  title: string
  summary: string
  risk: ActionRisk
  payload?: Record<string, unknown>
}

/** An interactive MCP app returned by a tool call; rendered in a sandboxed frame. */
export interface McpAppRequest {
  kind: 'mcp_app'
  id: string
  server: string
  resourceUri: string
  toolName: string
  toolInput: Record<string, unknown>
  toolResult: unknown
}

export type AgentUiRequest = AskUserRequest | RequestInputRequest | ApprovalRequest | McpAppRequest

/** A stored action, as listed by the action center. */
export interface ActionRecord {
  id: string
  kind: ActionKind
  title: string
  summary: string
  risk: ActionRisk
  status: ActionStatus
  createdAt: string
  decidedAt?: string
  /** Human-readable outcome once executed or failed. */
  result?: string
  payload?: Record<string, unknown>
}

/**
 * Routes used by the console:
 * - `GET  /v1/actions` → `{ actions: ActionRecord[] }` (newest first, scoped to the operator)
 * - `POST /v1/actions/:id/decision` body `{ decision: 'approve' | 'reject' }` → `ActionRecord`
 * - Answers to `ask_user` and `request_input` are sent as the next chat turn.
 */
export const ACTION_ROUTES = {
  list: '/v1/actions',
  decide: (id: string) => `/v1/actions/${encodeURIComponent(id)}/decision`,
} as const
