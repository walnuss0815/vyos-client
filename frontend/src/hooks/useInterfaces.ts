import { useQuery } from '@tanstack/react-query'
import { getInterfaces } from '../lib/vyosApi'
import { useRefetchInterval } from '../store/refreshSettings'

/** Live interface state (MAC, addresses, link state), shared by the
 * Dashboard preview and the full Interfaces page. Auto-refreshes per
 * the user's shared refresh-settings preference (store/refreshSettings.ts) -
 * this reflects state that changes on its own (link flaps, DHCP
 * renewals), unlike system info (hostname/version).
 *
 * `refetchIntervalOverride` lets a caller opt into a different (e.g.
 * faster, for a live throughput chart) cadence than the shared
 * preference, without affecting other call sites - the Dashboard's
 * chart uses this; every other page leaves it unset. Since this is
 * the same `['interfaces']` query key everywhere, whichever mounted
 * observer currently has the shortest interval effectively governs
 * how often the underlying request fires while both are on screen -
 * deliberate, not a bug: it means the rest of the Dashboard's
 * interfaces preview also freshens up while the chart is visible,
 * rather than issuing a second redundant request for the same data. */
export function useInterfaces(refetchIntervalOverride?: number | false) {
  const sharedRefetchInterval = useRefetchInterval()
  return useQuery({
    queryKey: ['interfaces'],
    queryFn: getInterfaces,
    select: (res) => res.interfaces,
    refetchInterval: refetchIntervalOverride ?? sharedRefetchInterval,
  })
}
