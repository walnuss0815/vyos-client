import { useState } from 'react'
import type { PKIExpiryEntry } from '../../lib/vyosApi'

/** Below this many days remaining, the badge switches from a plain
 * "expires <date>" note to an amber "expires in Nd" warning. 30 days
 * is a common, if arbitrary, industry default for "renew this soon"
 * - not sourced from any VyOS-specific guidance. */
const EXPIRING_SOON_DAYS = 30

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * A small colored badge showing a certificate/CA's expiry status -
 * plain/muted if it's comfortably valid, amber if it expires within
 * EXPIRING_SOON_DAYS, red if it has already expired. Renders nothing
 * if `entry` is missing or has no `notAfter` at all (still loading, or
 * the certificate has no PEM stored/couldn't be parsed - see
 * usePKIExpiry.ts and PKIExpiryEntry's own doc comment for why that's
 * treated as "nothing to show" rather than an error state here).
 */
export default function ExpiryBadge({ entry }: { entry: PKIExpiryEntry | undefined }) {
  // Date.now() is impure to call directly during render (React may
  // re-invoke the render function for reasons unrelated to this
  // component's own props/state) - a lazy useState initializer runs
  // exactly once per mount instead, which is more than precise enough
  // for a day-granularity "days remaining" figure.
  const [now] = useState(() => Date.now())

  if (!entry?.notAfter) return null

  const notAfter = new Date(entry.notAfter)
  const daysRemaining = Math.ceil((notAfter.getTime() - now) / MS_PER_DAY)
  const dateLabel = notAfter.toLocaleDateString()

  if (daysRemaining < 0) {
    return (
      <span
        title={`Expired ${dateLabel}`}
        className="rounded bg-danger-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-danger-500"
      >
        expired {dateLabel}
      </span>
    )
  }
  if (daysRemaining <= EXPIRING_SOON_DAYS) {
    return (
      <span
        title={`Expires ${dateLabel}`}
        className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-500"
      >
        expires in {daysRemaining}d
      </span>
    )
  }
  return (
    <span className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-400">
      expires {dateLabel}
    </span>
  )
}
