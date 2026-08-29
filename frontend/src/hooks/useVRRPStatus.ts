import { useQuery } from '@tanstack/react-query'
import { getVRRPStatus } from '../lib/vyosApi'

/** VRRP's live per-group state (`show vrrp`) - op-mode data, so this
 * deliberately doesn't use the `['config-tree', ...]` query-key prefix
 * PendingChangesBar invalidates after a commit. No auto-poll by
 * default, per the same "basic status" scope decision made for
 * Load-balancing's status panels - refreshed via this query's own
 * refetch() from a manual button.
 *
 * Previously lived in useHAStatus.ts alongside useConntrackSyncStatus
 * (also moved to its own file) - split out so every hook file in this
 * directory exports exactly one hook matching its filename, per the
 * convention every other hook here already follows. */
export function useVRRPStatus() {
  return useQuery({
    queryKey: ['ha-status', 'vrrp'],
    queryFn: getVRRPStatus,
    select: (res) => res.groups,
  })
}
