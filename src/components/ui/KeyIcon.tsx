interface KeyIconProps {
  kind: 'phone' | 'email'
  size?: number
  className?: string
}

export function KeyIcon({ kind, size = 32, className = '' }: KeyIconProps) {
  return (
    <svg
      width={size}
      height={size * 0.52}
      viewBox="0 0 120 62"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={kind === 'phone' ? 'Crédit téléphone' : 'Crédit email'}
    >
      {/* Shaft + teeth */}
      <rect x="28" y="18" width="84" height="16" rx="4" fill="currentColor" />
      <rect x="80" y="34" width="14" height="12" rx="2" fill="currentColor" />
      <rect x="102" y="34" width="10" height="8" rx="2" fill="currentColor" />

      {/* Circle head */}
      <circle cx="28" cy="26" r="26" fill="currentColor" />

      {/* t! inside circle */}
      <text
        x="28" y="33"
        textAnchor="middle"
        fill="white"
        fontSize="18"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="-0.5"
      >
        t!
      </text>

      {/* Small icon inside teeth zone */}
      {kind === 'email' ? (
        // Envelope
        <g transform="translate(80, 34)">
          <rect x="1" y="1" width="12" height="9" rx="1.5" fill="white" opacity="0.95" />
          <polyline points="1,2 7,7 13,2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : (
        // Phone handset
        <g transform="translate(81, 35)">
          <path
            d="M3 1C2.5 1 2 1.4 1.5 2.2L1 3.2C0.7 3.8 0.8 4.5 1.2 5L2.5 6.5C2.8 6.9 2.8 7.4 2.5 7.8L2 8.5C1.7 8.9 2 9.5 2.5 9.5H4C4.6 9.5 5.2 9.3 5.8 8.8L7.5 7.2C8 6.7 8.2 6.2 8.2 5.6V4.2C8.2 3.6 7.9 3 7.4 2.5L6 1.3C5.5 0.8 4.9 0.8 4.4 1C4 1.1 3.5 1 3 1Z"
            fill="white"
            opacity="0.95"
          />
        </g>
      )}
    </svg>
  )
}

export function KeyIconSmall({ kind, className = '' }: { kind: 'phone' | 'email'; className?: string }) {
  return <KeyIcon kind={kind} size={44} className={className} />
}
