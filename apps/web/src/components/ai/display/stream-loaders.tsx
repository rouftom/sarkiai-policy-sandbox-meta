'use client'

/**
 * The streaming indicator of the assistant, in three styles the operator picks
 * from the "+" menu. The choice is kept on this device and applies to every
 * conversation. Each style is decorative: the status text carries the meaning.
 */

import * as React from 'react'
import { cn } from '@sps/ui'
import { StreamIndicator } from '@/components/ai/display/stream-indicator'

export const STREAM_LOADERS = ['blocks', 'wind', 'cube'] as const
export type StreamLoaderVariant = (typeof STREAM_LOADERS)[number]
export const DEFAULT_STREAM_LOADER: StreamLoaderVariant = 'blocks'

/** A 3×3 grid of blocks that breathe in a wave, each one a little after its neighbour. */
export function BlocksWave(props: React.SVGProps<SVGSVGElement>) {
  // SMIL references elements by id: each instance needs its own ids.
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '')
  const first = `bw${uid}first`
  const last = `bw${uid}last`
  const after = (delay: number) => `${first}.begin+${delay}s`
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
      <title>blocks-wave</title>
      <Block id={first} x={1} y={1} begin={`0;${last}.end+0.2s`} xValues="1;4;1" yValues="1;4;1" />
      <Block x={8.33} y={1} begin={after(0.1)} xValues="8.33;11.33;8.33" yValues="1;4;1" />
      <Block x={1} y={8.33} begin={after(0.1)} xValues="1;4;1" yValues="8.33;11.33;8.33" />
      <Block x={15.66} y={1} begin={after(0.2)} xValues="15.66;18.66;15.66" yValues="1;4;1" />
      <Block x={8.33} y={8.33} begin={after(0.2)} xValues="8.33;11.33;8.33" yValues="8.33;11.33;8.33" />
      <Block x={1} y={15.66} begin={after(0.2)} xValues="1;4;1" yValues="15.66;18.66;15.66" />
      <Block x={15.66} y={8.33} begin={after(0.3)} xValues="15.66;18.66;15.66" yValues="8.33;11.33;8.33" />
      <Block x={8.33} y={15.66} begin={after(0.3)} xValues="8.33;11.33;8.33" yValues="15.66;18.66;15.66" />
      <Block id={last} x={15.66} y={15.66} begin={after(0.4)} xValues="15.66;18.66;15.66" yValues="15.66;18.66;15.66" />
    </svg>
  )
}

function Block({
  id,
  x,
  y,
  begin,
  xValues,
  yValues,
}: {
  id?: string
  x: number
  y: number
  begin: string
  xValues: string
  yValues: string
}) {
  const size = '7.33;1.33;7.33'
  return (
    <rect width="7.33" height="7.33" x={x} y={y} fill="currentColor">
      <animate id={id} attributeName="x" begin={begin} dur="0.6s" values={xValues} />
      <animate attributeName="y" begin={begin} dur="0.6s" values={yValues} />
      <animate attributeName="width" begin={begin} dur="0.6s" values={size} />
      <animate attributeName="height" begin={begin} dur="0.6s" values={size} />
    </rect>
  )
}

/** A single shape turning on its axis, like a wind vane in a gust. */
export function WindToy(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
      <title>wind-toy</title>
      <path
        fill="currentColor"
        d="M20.27,4.74a4.93,4.93,0,0,1,1.52,4.61,5.32,5.32,0,0,1-4.1,4.51,5.12,5.12,0,0,1-5.2-1.5,5.53,5.53,0,0,0,6.13-1.48A5.66,5.66,0,0,0,20.27,4.74ZM12.32,11.53a5.49,5.49,0,0,0-1.47-6.2A5.57,5.57,0,0,0,4.71,3.72,5.17,5.17,0,0,1,9.53,2.2,5.52,5.52,0,0,1,13.9,6.45,5.28,5.28,0,0,1,12.32,11.53ZM19.2,20.29a4.92,4.92,0,0,1-4.72,1.49,5.32,5.32,0,0,1-4.34-4.05A5.2,5.2,0,0,1,11.6,12.5a5.6,5.6,0,0,0,1.51,6.13A5.63,5.63,0,0,0,19.2,20.29ZM3.79,19.38A5.18,5.18,0,0,1,2.32,14a5.3,5.3,0,0,1,4.59-4,5,5,0,0,1,4.58,1.61,5.55,5.55,0,0,0-6.32,1.69A5.46,5.46,0,0,0,3.79,19.38ZM12.23,12a5.11,5.11,0,0,0,3.66-5,5.75,5.75,0,0,0-3.18-6,5,5,0,0,1,4.42,2.3,5.21,5.21,0,0,1,.24,5.92A5.4,5.4,0,0,1,12.23,12ZM11.76,12a5.18,5.18,0,0,0-3.68,5.09,5.58,5.58,0,0,0,3.19,5.79c-1,.35-2.9-.46-4-1.68A5.51,5.51,0,0,1,11.76,12ZM23,12.63a5.07,5.07,0,0,1-2.35,4.52,5.23,5.23,0,0,1-5.91.2,5.24,5.24,0,0,1-2.67-4.77,5.51,5.51,0,0,0,5.45,3.33A5.52,5.52,0,0,0,23,12.63ZM1,11.23a5,5,0,0,1,2.49-4.5,5.23,5.23,0,0,1,5.81-.06,5.3,5.3,0,0,1,2.61,4.74A5.56,5.56,0,0,0,6.56,8.06,5.71,5.71,0,0,0,1,11.23Z"
      >
        <animateTransform attributeName="transform" dur="1.5s" repeatCount="indefinite" type="rotate" values="0 12 12;360 12 12" />
      </path>
    </svg>
  )
}

/** The glyph of one style. The cube keeps its own fixed size. */
export function LoaderGlyph({ variant, className }: { variant: StreamLoaderVariant; className?: string }) {
  if (variant === 'cube') return <StreamIndicator />
  if (variant === 'wind') return <WindToy aria-hidden="true" className={cn('text-brand-primary dark:text-brand-primary-light', className)} />
  return <BlocksWave aria-hidden="true" className={cn('text-brand-primary dark:text-brand-primary-light', className)} />
}

const STORAGE_KEY = 'sps.streamLoader'
const listeners = new Set<() => void>()

function isVariant(value: unknown): value is StreamLoaderVariant {
  return typeof value === 'string' && (STREAM_LOADERS as readonly string[]).includes(value)
}

function readVariant(): StreamLoaderVariant {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isVariant(stored) ? stored : DEFAULT_STREAM_LOADER
  } catch {
    return DEFAULT_STREAM_LOADER
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

/** The chosen style, shared by every mounted assistant on this device. */
export function useStreamLoader(): [StreamLoaderVariant, (value: StreamLoaderVariant) => void] {
  const variant = React.useSyncExternalStore(subscribe, readVariant, () => DEFAULT_STREAM_LOADER)
  const choose = React.useCallback((value: StreamLoaderVariant) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    listeners.forEach((listener) => listener())
  }, [])
  return [variant, choose]
}

/** The indicator shown while the assistant writes its answer. */
export function StreamLoader({ className }: { className?: string }) {
  const [variant] = useStreamLoader()
  return <LoaderGlyph variant={variant} className={cn('h-5 w-5', className)} />
}
