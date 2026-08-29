import type { ReactNode } from 'react'
import { labelClass } from '../lib/formStyles'
import InfoTooltip from './InfoTooltip'

/**
 * Drop-in replacement for the ubiquitous
 * `<label className={labelClass}>Text<input/></label>` pattern used
 * throughout every form in this app, with an optional InfoTooltip
 * appended next to the label text. Existing call sites can adopt this
 * incrementally (it's a strict superset - omitting `hint` renders
 * identically to a plain label), rather than needing every form
 * touched in one pass.
 */
export default function FieldLabel({
  label,
  hint,
  className = labelClass,
  children,
}: {
  label: ReactNode
  /** Short, original-wording explanation - see InfoTooltip's doc
   * comment for why it must not be copied from VyOS's own docs. */
  hint?: string
  className?: string
  children: ReactNode
}) {
  return (
    <label className={className}>
      <span className="inline-flex items-center gap-1">
        {label}
        {hint && <InfoTooltip text={hint} />}
      </span>
      {children}
    </label>
  )
}
