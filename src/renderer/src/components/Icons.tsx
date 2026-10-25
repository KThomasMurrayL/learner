interface IconProps {
  size?: number
  className?: string
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
})

export function IconSpark({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
    </svg>
  )
}

export function IconBook({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 5.5A2.5 2.5 0 016.5 3H20v15.5H6.5A2.5 2.5 0 004 21V5.5z" />
      <path d="M20 18.5H6.5A2.5 2.5 0 004 21" />
      <path d="M8 7h8M8 10.5h5" />
    </svg>
  )
}

export function IconLibrary({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3.5" y="4" width="5" height="16" rx="1.2" />
      <rect x="10.5" y="4" width="5" height="16" rx="1.2" />
      <path d="M17.5 5.2l3.1.8a1.2 1.2 0 01.85 1.47l-2.9 11.1" />
    </svg>
  )
}

export function IconSettings({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.03 1.56V21a2 2 0 11-4 0v-.09A1.7 1.7 0 008.4 19.3a1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 004.04 15a1.7 1.7 0 00-1.56-1.03H2.4a2 2 0 110-4h.09A1.7 1.7 0 004.05 8.9a1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06A1.7 1.7 0 008.4 4.54 1.7 1.7 0 009.43 3V2.9a2 2 0 114 0v.09a1.7 1.7 0 001.03 1.56 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87v.05a1.7 1.7 0 001.56 1.03h.09a2 2 0 110 4h-.09a1.7 1.7 0 00-1.56 1.01z" />
    </svg>
  )
}

export function IconArrowRight({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function IconArrowLeft({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  )
}

export function IconCheck({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4.5 12.5l4.5 4.5L19.5 6.5" />
    </svg>
  )
}

export function IconClose({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function IconAlert({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3.8L21 20H3L12 3.8z" />
      <path d="M12 9.5v4.2M12 17h.01" />
    </svg>
  )
}

export function IconRefresh({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 11a8 8 0 10-2.5 6.5" />
      <path d="M20 4.5V11h-6.2" />
    </svg>
  )
}

export function IconClock({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </svg>
  )
}

export function IconTrash({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l.9 13h9.2l.9-13" />
      <path d="M10.2 10.5v6M13.8 10.5v6" />
    </svg>
  )
}

export function IconChevronDown({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  )
}

export function IconTarget({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconBrain({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9.5 4.2A3.2 3.2 0 006.3 7v.4A3.3 3.3 0 004 10.6c0 1.3.7 2.4 1.8 2.9a3.3 3.3 0 002.7 4.9c.5 1 1.5 1.6 2.7 1.6h1.3V4.2H9.5z" />
      <path d="M14.5 4.2A3.2 3.2 0 0117.7 7v.4a3.3 3.3 0 012.3 3.2c0 1.3-.7 2.4-1.8 2.9a3.3 3.3 0 01-2.7 4.9c-.5 1-1.5 1.6-2.7 1.6h-1.3V4.2h2.9z" />
    </svg>
  )
}

export function IconLightbulb({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 18h6M10 21h4" />
      <path d="M8.2 14.2A6 6 0 1115.8 14c-.9.8-1.3 1.7-1.3 2.5H9.5c0-.8-.4-1.6-1.3-2.3z" />
    </svg>
  )
}

export function IconPlay({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M8 5.5l10 6.5-10 6.5v-13z" />
    </svg>
  )
}

export function IconPlus({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconFileText({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 3h8l4 4v14H6V3z" />
      <path d="M14 3v4h4M9 12h6M9 15.5h6M9 8.5h2" />
    </svg>
  )
}

export function IconLayers({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 12.5l9 5 9-5M3 17l9 5 9-5" />
    </svg>
  )
}

export function IconLogo({ size = 26, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="1.2" y="1.2" width="29.6" height="29.6" rx="9" fill="currentColor" opacity="0.1" />
      <path
        d="M16 8.2c-2-1.4-4.4-2-7-2v15.5c2.6 0 5 .6 7 2 2-1.4 4.4-2 7-2V6.2c-2.6 0-5 .6-7 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M16 8.2v15.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 12.4h1.2M19 12.4h1.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function IconKeyboard({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2.2" />
      <path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M8 13.5h8" />
    </svg>
  )
}
