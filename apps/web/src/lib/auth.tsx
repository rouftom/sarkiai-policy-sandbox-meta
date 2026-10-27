'use client'

/**
 * Operator session for the console.
 *
 * Password first, then the second factor. On the very first sign-in the second
 * step is TOTP enrolment: the API hands back the otpauth URI, the operator scans
 * it once and confirms a code; recovery codes are shown once. Every later
 * sign-in asks for the 6-digit code (or a single-use recovery code).
 *
 * The token is stateless and stored in `localStorage`; a 401 anywhere simply
 * sends the operator back to `/login`.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  ApiError,
  authApi,
  type ChallengeDto,
  type EnrollmentDto,
  type OperatorDto,
  type PreferencesDto,
  type SessionDto,
  type VerificationDto,
} from './api'
import { clearSession, readSession, readToken, writeSession } from './session'

interface AuthContextValue {
  operator: OperatorDto | null
  loading: boolean
  /** Steps of the sign-in flow, kept here so the login page survives a rerender. */
  pending: ChallengeDto | null
  /** Address waiting for its confirmation link (sign-up, or a sign-in before confirmation). */
  verificationEmail: string | null
  enrollment: EnrollmentDto | null
  backupCodes: string[] | null
  /** Resolves to `null` when the address still has to be confirmed. */
  signIn: (email: string, password: string) => Promise<ChallengeDto | null>
  /** Public sign-up (cloud demo): creates the account, then waits for the confirmation link. */
  signUp: (input: { firstName: string; lastName: string; email: string; password: string }) => Promise<VerificationDto>
  changePassword: (password: string) => Promise<ChallengeDto>
  startEnrollment: () => Promise<EnrollmentDto>
  confirmEnrollment: (code: string) => Promise<void>
  verifyCode: (code: string) => Promise<void>
  resetFlow: () => void
  dismissBackupCodes: () => void
  signOut: () => Promise<void>
  refresh: () => Promise<void>
  savePreferences: (patch: Partial<PreferencesDto>) => Promise<PreferencesDto>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

/** Address still waiting for its link. Kept per tab so a reload stays on the progression. */
const VERIFICATION_KEY = 'sps.verification'

function sessionFrom(dto: SessionDto): void {
  writeSession({ token: dto.token, expiresAt: dto.expiresAt, email: dto.operator.email })
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [operator, setOperator] = React.useState<OperatorDto | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [pending, setPending] = React.useState<AuthContextValue['pending']>(null)
  const [verificationEmail, setVerificationEmailState] = React.useState<string | null>(null)

  const setVerificationEmail = React.useCallback((email: string | null) => {
    setVerificationEmailState(email)
    if (email) window.sessionStorage.setItem(VERIFICATION_KEY, email)
    else window.sessionStorage.removeItem(VERIFICATION_KEY)
  }, [])

  React.useEffect(() => {
    const stored = window.sessionStorage.getItem(VERIFICATION_KEY)
    if (stored) setVerificationEmailState(stored)
  }, [])
  const [enrollment, setEnrollment] = React.useState<EnrollmentDto | null>(null)
  const [backupCodes, setBackupCodes] = React.useState<string[] | null>(null)

  const refresh = React.useCallback(async () => {
    if (!readToken()) {
      setOperator(null)
      setLoading(false)
      return
    }
    try {
      const { operator: next } = await authApi.me()
      setOperator(next)
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearSession()
        setOperator(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  // A session that expires while the tab is open should not leave a dead shell.
  React.useEffect(() => {
    const stored = readSession()
    if (!stored?.expiresAt) return
    const remaining = Date.parse(stored.expiresAt) - Date.now()
    if (remaining <= 0) return
    const timer = window.setTimeout(() => {
      clearSession()
      setOperator(null)
      router.replace('/login')
    }, remaining)
    return () => window.clearTimeout(timer)
  }, [operator, router])

  const signIn = React.useCallback(
    async (email: string, password: string) => {
      try {
        const result = await authApi.login({ email, password })
        setVerificationEmail(null)
        setPending(result)
        setEnrollment(null)
        setBackupCodes(null)
        return result
      } catch (cause) {
        // The password was right, the address was never confirmed: show the
        // confirmation step instead of an error, and keep the address.
        if (cause instanceof ApiError && cause.status === 403 && cause.json<{ error?: string }>()?.error === 'email_not_verified') {
          setPending(null)
          setVerificationEmail(email)
          return null
        }
        throw cause
      }
    },
    [setVerificationEmail],
  )

  const signUp = React.useCallback(
    async (input: { firstName: string; lastName: string; email: string; password: string }) => {
      const result = await authApi.signup(input)
      setPending(null)
      setVerificationEmail(input.email)
      setEnrollment(null)
      setBackupCodes(null)
      return result
    },
    [setVerificationEmail],
  )

  const startEnrollment = React.useCallback(async () => {
    if (!pending) throw new Error('No sign-in in progress.')
    const next = await authApi.enroll(pending.challenge)
    setEnrollment(next)
    return next
  }, [pending])

  /** First sign-in of an invited account: replace the mailed password, then 2FA. */
  const changePassword = React.useCallback(
    async (password: string) => {
      if (!pending) throw new Error('No sign-in in progress.')
      const result = await authApi.changePassword(pending.challenge, password)
      setPending(result)
      return result
    },
    [pending],
  )

  const acceptSession = React.useCallback(
    (session: SessionDto) => {
      sessionFrom(session)
      setOperator(session.operator)
      setPending(null)
      setVerificationEmail(null)
      setEnrollment(null)
      setBackupCodes(session.backupCodes ?? null)
    },
    [setVerificationEmail],
  )

  const confirmEnrollment = React.useCallback(
    async (code: string) => {
      if (!pending) throw new Error('No sign-in in progress.')
      acceptSession(await authApi.confirmEnrollment(pending.challenge, code))
    },
    [acceptSession, pending],
  )

  const verifyCode = React.useCallback(
    async (code: string) => {
      if (!pending) throw new Error('No sign-in in progress.')
      acceptSession(await authApi.verify(pending.challenge, code))
    },
    [acceptSession, pending],
  )

  const resetFlow = React.useCallback(() => {
    setPending(null)
    setVerificationEmail(null)
    setEnrollment(null)
    setBackupCodes(null)
  }, [setVerificationEmail])

  const dismissBackupCodes = React.useCallback(() => setBackupCodes(null), [])

  const signOut = React.useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      /* the token is dropped locally regardless */
    }
    clearSession()
    setOperator(null)
    setPending(null)
    setVerificationEmail(null)
    setEnrollment(null)
    setBackupCodes(null)
    router.replace('/login')
  }, [router])

  const savePreferences = React.useCallback(
    async (patch: Partial<PreferencesDto>) => {
      const { preferences } = await authApi.updatePreferences(patch)
      setOperator((current) => (current ? { ...current, preferences } : current))
      return preferences
    },
    [],
  )

  const value = React.useMemo<AuthContextValue>(
    () => ({
      operator,
      loading,
      pending,
      verificationEmail,
      enrollment,
      backupCodes,
      signIn,
      signUp,
      changePassword,
      startEnrollment,
      confirmEnrollment,
      verifyCode,
      resetFlow,
      dismissBackupCodes,
      signOut,
      refresh,
      savePreferences,
    }),
    [
      operator,
      loading,
      pending,
      verificationEmail,
      enrollment,
      backupCodes,
      signIn,
      signUp,
      changePassword,
      startEnrollment,
      confirmEnrollment,
      verifyCode,
      resetFlow,
      dismissBackupCodes,
      signOut,
      refresh,
      savePreferences,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.')
  return context
}
