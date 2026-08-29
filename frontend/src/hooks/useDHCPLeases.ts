import { useQuery } from '@tanstack/react-query'
import { getDHCPLeases } from '../lib/vyosApi'
import { useRefetchInterval } from '../store/refreshSettings'

/** Live DHCP leases. Auto-refreshes per the user's shared
 * refresh-settings preference - leases come and go on their own as
 * clients renew/release, unlike system info. */
export function useDHCPLeases() {
  const refetchInterval = useRefetchInterval()
  return useQuery({
    queryKey: ['dhcp-leases'],
    queryFn: getDHCPLeases,
    select: (res) => res.leases,
    refetchInterval,
  })
}
