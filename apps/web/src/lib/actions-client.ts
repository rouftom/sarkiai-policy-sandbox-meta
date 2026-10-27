/** Client for the operator action center (proposed side effects awaiting a decision). */

import { ACTION_ROUTES, type ActionRecord } from './agent-ui'
import { API_URL, ApiError } from './api'
import { readToken } from './session'

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

/** Newest first, scoped to the signed-in operator by the API. */
export async function listActions(): Promise<ActionRecord[]> {
  const response = await fetch(`${API_URL}${ACTION_ROUTES.list}`, { headers: authHeaders(false) })
  await failOnError(response)
  const body = (await response.json()) as { actions: ActionRecord[] }
  return body.actions
}

export async function decideAction(id: string, decision: 'approve' | 'reject'): Promise<ActionRecord> {
  const response = await fetch(`${API_URL}${ACTION_ROUTES.decide(id)}`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ decision }),
  })
  await failOnError(response)
  return (await response.json()) as ActionRecord
}
