import { useQuery } from '@tanstack/react-query'
import { getQosShaperStatus } from '../lib/vyosApi'

/** `show qos shaper interface <ifname>`'s per-class stats - op-mode
 * data, manually refreshed (no auto-poll), matching every other
 * area's "basic status" precedent. Disabled until an interface is
 * selected. See the backend's ParseQosShaperStatus doc comment for
 * the important scope note: this only returns data for interfaces
 * whose egress policy is specifically of type `shaper`. */
export function useQosShaperStatus(ifname: string | undefined) {
  return useQuery({
    queryKey: ['qos-shaper-status', ifname],
    queryFn: () => getQosShaperStatus(ifname as string),
    enabled: ifname !== undefined && ifname !== '',
  })
}
