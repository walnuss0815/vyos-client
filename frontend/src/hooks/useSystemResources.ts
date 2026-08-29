import { useQuery } from '@tanstack/react-query'
import { getSystemResources } from '../lib/vyosApi'
import { useRefetchInterval } from '../store/refreshSettings'

/**
 * Live uptime/CPU/memory/disk usage for the Dashboard's resource
 * cards. Auto-refreshes per the user's shared refresh-settings
 * preference, unlike useSystemInfo (hostname/version, which can't
 * change without a commit+reboot) - these genuinely change on their
 * own, the same category useInterfaces/useRoutes/useDHCPLeases are in.
 *
 * `refetchIntervalOverride` lets the Dashboard's live CPU/memory
 * charts opt into a faster cadence than the shared preference,
 * without a second/duplicate request - see useInterfaces's doc
 * comment for the same pattern and its rationale.
 */
export function useSystemResources(refetchIntervalOverride?: number | false) {
  const sharedRefetchInterval = useRefetchInterval()
  return useQuery({
    queryKey: ['system-resources'],
    queryFn: getSystemResources,
    refetchInterval: refetchIntervalOverride ?? sharedRefetchInterval,
  })
}
