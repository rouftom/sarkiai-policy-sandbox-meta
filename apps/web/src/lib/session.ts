/** Session token storage for the console.
 *
 * The API and the web app are on different origins, so the session travels as
 * a bearer token instead of a cookie. It lives in `localStorage` and is read by
 * the API client on demand; nothing is read at module scope so the app still
 * renders on the server.
 */

export const SESSION_STORAGE_KEY = 'sps.session'

export interface StoredSession {
  token: string
  expiresAt: string
  email: string
}

export function readSession(): StoredSession | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed.token) return null
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) < Date.now()) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export function readToken(): string | null {
  return readSession()?.token ?? null
}

export function writeSession(session: StoredSession): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(SESSION_STORAGE_KEY)
}
