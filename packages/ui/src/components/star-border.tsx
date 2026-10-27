import React from 'react'
import { cn } from '../lib/cn'

type StarBorderProps<T extends React.ElementType> = React.ComponentPropsWithoutRef<T> & {
  as?: T
  className?: string
  children?: React.ReactNode
  color?: string
  speed?: React.CSSProperties['animationDuration']
  thickness?: number
  isAnimate?: boolean
}

/**
 * Rounded border with a light moving along its top and bottom edges. Used
 * around the console's tab strip, which pulses while a run is saving.
 */
export function StarBorder<T extends React.ElementType = 'div'>({
  as,
  className = '',
  color = 'var(--charte-primary)',
  speed = '3s',
  thickness = 2,
  isAnimate = true,
  children,
  ...rest
}: StarBorderProps<T>) {
  const Component = as || 'div'

  return (
    <Component
      className={cn('relative inline-block overflow-hidden rounded-[20px]', className)}
      {...(rest as any)}
      style={{ padding: `${thickness}px`, ...(rest as any).style }}
    >
      <div
        className={cn(
          'absolute bottom-[-11px] right-[-250%] z-0 h-[50%] w-[300%] rounded-full opacity-70',
          isAnimate && 'animate-star-movement-bottom',
        )}
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          ...(isAnimate && { animationDuration: speed }),
        }}
      />
      <div
        className={cn(
          'absolute left-[-250%] top-[-10px] z-0 h-[50%] w-[300%] rounded-full opacity-70',
          isAnimate && 'animate-star-movement-top',
        )}
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          ...(isAnimate && { animationDuration: speed }),
        }}
      />
      <div className="relative z-[1] h-full w-full rounded-[inherit]">{children}</div>
    </Component>
  )
}
