import { useState } from 'react'
import Icon from './Icon'

/** small circled "i"; reveals a tooltip on hover, focus, or tap (works on touch
 *  where there is no hover). Tooltip text is plain, already-localized copy.
 *  `className` lets callers re-anchor the popup (e.g. table-edge headers). */
export default function InfoDot({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className={`infodot${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="infodot-btn"
        aria-label={text}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        <Icon name="info" size={14} />
      </button>
      <span className={`infodot-tip${open ? ' open' : ''}`} role="tooltip">
        {text}
      </span>
    </span>
  )
}
