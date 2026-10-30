'use client'

/**
 * The reasoning effort the assistant asks of the model, chosen from the "+" menu
 * and kept on this device. "Auto" leaves the choice to the provider.
 */

import * as React from 'react'

export const EFFORTS = ['auto', 'minimal', 'low', 'medium', 'high'] as const
export type AssistantEffort = (typeof EFFORTS)[number]
export const DEFAULT_EFFORT: AssistantEffort = 'auto'

const STORAGE_KEY = 'sps.assistantEffort'
const listeners = new Set<() => void>()

function isEffort(value: unknown): value is AssistantEffort {
  return typeof value === 'string' && (EFFORTS as readonly string[]).includes(value)
}

function readEffort(): AssistantEffort {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isEffort(stored) ? stored : DEFAULT_EFFORT
  } catch {
    return DEFAULT_EFFORT
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useAssistantEffort(): [AssistantEffort, (value: AssistantEffort) => void] {
  const effort = React.useSyncExternalStore(subscribe, readEffort, () => DEFAULT_EFFORT)
  const choose = React.useCallback((value: AssistantEffort) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    listeners.forEach((listener) => listener())
  }, [])
  return [effort, choose]
}
