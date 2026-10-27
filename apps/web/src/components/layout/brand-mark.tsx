/**
 * Sarka mark: a shield carrying a leaf, drawn from the FSM palette (deep green,
 * bright green, gold). Inline SVG so the logo inherits the theme colours and
 * needs no asset pipeline.
 */
export function BrandMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" role="img" aria-label="Sarkia" className={className}>
      <defs>
        <linearGradient id="brand-shield" x1="6" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1B834F" />
          <stop offset="1" stopColor="#0B3D27" />
        </linearGradient>
      </defs>
      <path
        d="M20 2.5 35 7.5v12.2c0 8.4-6 15.6-15 18.8-9-3.2-15-10.4-15-18.8V7.5L20 2.5Z"
        fill="url(#brand-shield)"
        stroke="#D9A928"
        strokeOpacity="0.6"
        strokeWidth="1.2"
      />
      <path
        d="M20 10.5c4.6 2.7 7 6.4 7 10.6 0 4.5-3.1 7.6-7 8.9-3.9-1.3-7-4.4-7-8.9 0-4.2 2.4-7.9 7-10.6Z"
        fill="#22C55E"
        fillOpacity="0.22"
        stroke="#7BE3A6"
        strokeWidth="1"
      />
      <path
        d="M20 13.5v14.1M20 19.2c1.9-1.6 4-2.4 6.2-2.4M20 23.5c-1.9-1.6-4-2.4-6.2-2.4"
        stroke="#D4AF37"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BrandWordmark({ short = 'SPS' }: { short?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-display text-[15px] font-bold tracking-tight text-slate-900 dark:text-slate-100">
        {short}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-brand-primary dark:text-brand-primary-light">
        SarkiAI
      </span>
    </span>
  )
}
