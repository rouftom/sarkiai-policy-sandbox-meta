'use client'

import * as React from 'react'
import { OTPInput, REGEXP_ONLY_DIGITS } from 'input-otp'
import { cn } from '@sps/ui'

/** Same separators and alphabet as the FSM second-factor screen. */
export const BACKUP_CODE_PATTERN = '^[a-zA-Z0-9-]*$'

/** Insert the 5+5 separator the API stores in its recovery codes. */
export function formatBackupCode(value: string): string {
  const characters = value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
  return characters.length > 5 ? `${characters.slice(0, 5)}-${characters.slice(5)}` : characters
}

export interface OtpFieldProps {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  label: string
  disabled?: boolean
  autoFocus?: boolean
  /** `backup` renders the compact 10-character + separator layout. */
  variant?: 'totp' | 'backup'
  invalid?: boolean
}

/**
 * Segmented one-time-code input (`input-otp`), keycap styling from FSM:
 * gradient slot, active slot lifted, fake caret while the slot is focused.
 */
export function OtpField({
  value,
  onChange,
  onComplete,
  label,
  disabled = false,
  autoFocus = false,
  variant = 'totp',
  invalid = false,
}: OtpFieldProps) {
  const compact = variant === 'backup'

  return (
    <OTPInput
      id={`otp-${variant}`}
      name="code"
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      maxLength={compact ? 11 : 6}
      pattern={compact ? BACKUP_CODE_PATTERN : REGEXP_ONLY_DIGITS}
      inputMode={compact ? 'text' : 'numeric'}
      autoFocus={autoFocus}
      disabled={disabled}
      aria-label={label}
      aria-invalid={invalid}
      containerClassName="group flex items-center justify-center"
      className="border-none outline-none shadow-none"
      render={({ slots }) => (
        <div className={cn('flex', compact ? 'gap-1 sm:gap-1.5' : 'gap-1.5 sm:gap-2')}>
          {slots.map((slot, index) => {
            if (compact && index === 5) {
              return (
                <span
                  key={index}
                  aria-hidden="true"
                  className="flex h-10 w-3 items-center justify-center text-sm font-semibold text-muted-foreground sm:h-11 sm:w-4"
                >
                  -
                </span>
              )
            }

            return (
              <div
                key={index}
                className={cn(
                  compact
                    ? 'relative flex h-10 w-6 items-center justify-center overflow-hidden rounded-md sm:h-11 sm:w-7'
                    : 'relative flex h-12 w-9 items-center justify-center overflow-hidden rounded-lg sm:h-14 sm:w-11',
                  'border border-border bg-gradient-to-b from-white/[0.06] to-transparent',
                  'shadow-[0_2px_6px_-2px_rgb(0_0_0/0.35),inset_0_1px_0_hsl(0_0%_100%/0.07)]',
                  'transition-transform duration-150',
                  slot.isActive && 'translate-y-px border-brand-primary/60',
                  invalid && 'border-destructive/60',
                )}
              >
                <span
                  className={cn(
                    compact
                      ? 'text-sm font-semibold tabular-nums text-foreground'
                      : 'text-xl font-semibold tabular-nums text-foreground',
                  )}
                >
                  {slot.char}
                </span>
                {slot.hasFakeCaret && (
                  <span className="absolute bottom-1.5 h-0.5 w-3 rounded-full bg-foreground motion-safe:animate-pulse" />
                )}
              </div>
            )
          })}
        </div>
      )}
    />
  )
}
