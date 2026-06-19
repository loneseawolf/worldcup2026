import { useState } from 'react'
import type { ReactNode } from 'react'

/** Wraps arbitrary children so the children themselves become the tooltip
 *  trigger (no extra "i" icon). Reveals on hover, focus-within, or tap — the
 *  tap toggle mirrors InfoDot so it works on touch where there is no hover.
 *  `text` is plain, already-localized copy. */
export default function Tip({
  text,
  className,
  children,
}: {
  text: string
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <span
      className={`infodot tip-wrap${className ? ` ${className}` : ''}`}
      tabIndex={0}
      role="button"
      aria-label={text}
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
    >
      {children}
      <span className={`infodot-tip${open ? ' open' : ''}`} role="tooltip">
        {text}
      </span>
    </span>
  )
}
