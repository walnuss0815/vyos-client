import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getLogs, type GetLogsParams } from '../lib/vyosApi'
import { mergeLogLines } from '../lib/mergeLogLines'

/** Dedicated auto-poll cadence for the Logs page - same reasoning and
 * same fixed value as the Dashboard's live charts
 * (DashboardPage.tsx's LIVE_CHART_REFETCH_MS): independent of the
 * shared 15/30/60s auto-refresh preference, since every poll is a real
 * op-mode round-trip to the router and this is opt-in via its own
 * toggle, not tied to that shared setting. */
export const LOG_AUTO_POLL_MS = 5000

/** Upper bound on how much accumulated log text auto-poll mode keeps
 * on screen - each poll can only append what mergeLogLines finds to be
 * genuinely new, but an auto-poll session left running for a long time
 * would otherwise grow this without limit. */
const MAX_DISPLAY_LINES = 5000

export interface UseLogsOptions extends GetLogsParams {
  /** When true, polls at LOG_AUTO_POLL_MS and appends only the
   * genuinely new lines each successful poll finds (see
   * mergeLogLines) instead of replacing the view outright - reads like
   * a live-appending tail. When false, only an explicit refetch()
   * call fetches anything new. */
  autoPoll: boolean
  /** Set false to skip fetching entirely - e.g. source=container with
   * no containers configured yet, where there's nothing valid to ask
   * for. Defaults to true. */
  enabled?: boolean
}

/**
 * Fetches one of this app's curated log sources (see getLogs) and,
 * when autoPoll is on, accumulates successive polls into a single
 * appending view via mergeLogLines - VyOS has no incremental/`--since`
 * fetch mode, so every poll is a fresh bounded snapshot; this is what
 * turns that into something that reads like `tail -f` instead of the
 * displayed lines being replaced/flickering on every poll.
 *
 * Changing any of source/facility/priority/container/lines resets the
 * accumulated view - there's nothing meaningful to carry over once the
 * underlying command itself changed.
 */
export function useLogs(options: UseLogsOptions) {
  const { autoPoll, enabled = true, ...params } = options
  const { source, facility, priority, container, lines } = params

  const query = useQuery({
    queryKey: ['logs', source, facility, priority, container, lines],
    queryFn: () => getLogs(params),
    refetchInterval: autoPoll ? LOG_AUTO_POLL_MS : false,
    enabled,
  })

  const [displayLines, setDisplayLines] = useState<string[]>([])

  useEffect(() => {
    setDisplayLines([])
    // Resets the accumulated view whenever the underlying command
    // changes - intentionally a separate effect from the merge one
    // below, so a parameter change clears the view immediately rather
    // than waiting for (and then merging against) the new source's
    // first poll. This is a deliberate, necessary use of
    // setState-in-effect: resetting accumulated history *is* the
    // synchronization-with-an-external-event (the source/params
    // actually changing) this effect exists for, not derivable state
    // a plain render could compute instead - same reasoning as
    // useSampleHistory.ts.
    // oxlint-disable-next-line react/set-state-in-effect
  }, [source, facility, priority, container, lines])

  useEffect(() => {
    if (!query.data) return
    setDisplayLines((prev) => mergeLogLines(prev, query.data.lines).slice(-MAX_DISPLAY_LINES))
    // Appends exactly one merge per actual poll - keyed off
    // dataUpdatedAt (a real fetch just completed) rather than
    // query.data/query.data.lines directly, so a poll that returns
    // identical content still ticks the merge (a no-op via
    // mergeLogLines) instead of the effect silently never re-running.
    // oxlint-disable-next-line react-hooks/exhaustive-deps, react/set-state-in-effect
  }, [query.dataUpdatedAt])

  return {
    lines: displayLines,
    truncated: query.data?.truncated ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
    clear: () => setDisplayLines([]),
  }
}
