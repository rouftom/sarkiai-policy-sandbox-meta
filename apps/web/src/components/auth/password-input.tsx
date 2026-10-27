'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input, cn } from '@sps/ui'

export interface PasswordInputProps extends React.ComponentPropsWithoutRef<typeof Input> {
  /** Localised labels for the visibility switch (accessibility only). */
  showLabel: string
  hideLabel: string
}

/**
 * Password field with a visibility switch, as in the FSM sign-in screens.
 * The toggle is a real button so it stays keyboard reachable, and the input
 * keeps its ref so react-hook-form can register it.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, showLabel, hideLabel, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false)

    return (
      <div className="relative">
        <Input
          ref={ref}
          {...props}
          type={visible ? 'text' : 'password'}
          className={cn('pr-9', className)}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          title={visible ? hideLabel : showLabel}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    )
  },
)
PasswordInput.displayName = 'PasswordInput'
