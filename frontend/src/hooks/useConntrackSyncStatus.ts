import { useQuery } from '@tanstack/react-query'
import { getConntrackSyncStatus } from '../lib/vyosApi'

/** conntrack-sync's live status block (`show conntrack-sync status`) -
 * same manual-refresh, op-mode shape as useVRRPStatus.ts's
 * useVRRPStatus.
 *
 * Previously lived in useHAStatus.ts alongside useVRRPStatus (also
 * moved to its own file) - split out so every hook file in this
 * directory exports exactly one hook matching its filename, per the
 * convention every other hook here already follows. */
export function useConntrackSyncStatus() {
  return useQuery({
    queryKey: ['ha-status', 'conntrack-sync'],
    queryFn: getConntrackSyncStatus,
  })
}
