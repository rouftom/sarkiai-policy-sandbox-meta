/**
 * SPS mark: a shield carrying a leaf, drawn in the Meta blue palette
 * (#0866FF → #0043B8, #4E93FF leaf, #63C8FF veins). Inline SVG so the logo
 * stays crisp and needs no asset pipeline.
 */
export function BrandMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" role="img" aria-label="SarkiAI Policy Sandbox" className={className}>
      <defs>
        <linearGradient id="brand-shield" x1="6" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0866FF" />
          <stop offset="1" stopColor="#00368C" />
        </linearGradient>
      </defs>
      <path
        d="M20 2.5 35 7.5v12.2c0 8.4-6 15.6-15 18.8-9-3.2-15-10.4-15-18.8V7.5L20 2.5Z"
        fill="url(#brand-shield)"
        stroke="#63C8FF"
        strokeOpacity="0.6"
        strokeWidth="1.2"
      />
      <path
        d="M20 10.5c4.6 2.7 7 6.4 7 10.6 0 4.5-3.1 7.6-7 8.9-3.9-1.3-7-4.4-7-8.9 0-4.2 2.4-7.9 7-10.6Z"
        fill="#4E93FF"
        fillOpacity="0.22"
        stroke="#A9CBFF"
        strokeWidth="1"
      />
      <path
        d="M20 13.5v14.1M20 19.2c1.9-1.6 4-2.4 6.2-2.4M20 23.5c-1.9-1.6-4-2.4-6.2-2.4"
        stroke="#BFD9FF"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BrandWordmark({ short = 'SarkiAI Policy Sandbox' }: { short?: string }) {
  return (
    <span className="min-w-0 truncate font-display text-[13px] font-bold tracking-tight text-sidebar-foreground">{short}</span>
  )
}
