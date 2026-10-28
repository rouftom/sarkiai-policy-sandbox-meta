/** Client for the operator's saved assistant conversations. */

import { API_URL, ApiError } from './api'
import { readToken } from './session'

export interface ChatSessionSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  turnCount: number
}

export interface ChatSessionDetail extends ChatSessionSummary {
  turns: Array<Record<string, unknown>>
}

function authHeaders(json: boolean): HeadersInit {
  const token = readToken()
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function failOnError(response: Response): Promise<void> {
  if (!response.ok) throw new ApiError(response.status, await response.text())
}

export async function listChatSessions(): Promise<ChatSessionSummary[]> {
  const response = await fetch(`${API_URL}/v1/chat/sessions`, { headers: authHeaders(false) })
  await failOnError(response)
  return ((await response.json()) as { sessions: ChatSessionSummary[] }).sessions
}

export async function getChatSession(id: string): Promise<ChatSessionDetail> {
  const response = await fetch(`${API_URL}/v1/chat/sessions/${encodeURIComponent(id)}`, { headers: authHeaders(false) })
  await failOnError(response)
  return (await response.json()) as ChatSessionDetail
}

export async function saveChatSession(
  id: string,
  body: { title: string; turns: Array<Record<string, unknown>> },
): Promise<ChatSessionSummary> {
  const response = await fetch(`${API_URL}/v1/chat/sessions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  })
  await failOnError(response)
  return (await response.json()) as ChatSessionSummary
}

export async function deleteChatSession(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/v1/chat/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(false),
  })
  await failOnError(response)
}
