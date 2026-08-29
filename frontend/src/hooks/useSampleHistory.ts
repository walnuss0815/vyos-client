import { useEffect, useState } from 'react'

export interface Sample {
  /** `Date.now()`-style epoch milliseconds - not the server's clock,
   * since these are only ever compared against other client-side
   * timestamps (see UsageChart, which only needs relative spacing,
   * not wall-clock accuracy). */
  t: number
  v: number
}

/** Default rolling-window size: 150 samples. At the Dashboard's live
 * chart cadence (2s, see DashboardPage.tsx) that's still a 5-minute
 * window (150 * 2s = 300s) - long enough to show a meaningful trend,
 * short enough that the chart doesn't become unreadably dense or hold
 * onto stale history from long ago. The sample count was raised from
 * 60 to 150 when the refetch cadence itself was sped up from 5s to 2s,
 * specifically to keep the *visible history depth* unchanged (a
 * faster-updating chart covering the same 5 minutes, not a shorter
 * window) - a deliberate choice over the alternative of letting the
 * window shrink to 2 minutes. Not persisted anywhere; a page reload or
 * navigating away and back starts a fresh window, matching every other
 * "live" (not historical) operational-data view in this app. Exported
 * so DashboardPage.tsx can derive UsageChart's `windowMs` from the
 * same number, rather than duplicating the "150" magic number in two
 * places. */
export const DEFAULT_MAX_SAMPLES = 150

/**
 * Accumulates a bounded, in-memory time series for one live numeric
 * metric (e.g. CPU load%, memory used%), for feeding into UsageChart.
 *
 * Appends exactly one sample per actual refetch - keyed off the
 * query's own `dataUpdatedAt` timestamp rather than off `value`
 * itself, so a metric that's holding steady (e.g. an idle router's
 * flat 0% load between polls) still advances in time instead of
 * silently freezing the chart with no new points. `value` is read at
 * the moment `dataUpdatedAt` changes; passing `undefined` (loading/
 * error state) skips that tick entirely rather than recording a
 * placeholder zero.
 */
export function useSampleHistory(
  dataUpdatedAt: number,
  value: number | undefined,
  maxSamples: number = DEFAULT_MAX_SAMPLES,
): Sample[] {
  const [samples, setSamples] = useState<Sample[]>([])

  useEffect(() => {
    if (dataUpdatedAt === 0 || value === undefined) return
    setSamples((prev) => [...prev, { t: dataUpdatedAt, v: value }].slice(-maxSamples))
    // Deliberately NOT depending on `value` here (see doc comment
    // above) or `maxSamples` (a fixed prop in practice, and
    // re-slicing on every value-add already keeps the array bounded
    // regardless) - only a genuinely new poll should append a sample.
    // This is also a deliberate, necessary use of setState-in-effect:
    // accumulating history *is* the synchronization-with-an-external-
    // event this effect exists for (a completed poll), not derivable
    // state a plain render could compute instead.
    // oxlint-disable-next-line react-hooks/exhaustive-deps, react/set-state-in-effect
  }, [dataUpdatedAt])

  return samples
}
