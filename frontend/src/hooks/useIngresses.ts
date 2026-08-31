import { useQuery } from '@tanstack/react-query'
import { getIngresses } from '../lib/vyosApi'

/** Every configured ingress entry - backs both the sidebar's Ingress
 * nav group (Layout.tsx) and IngressPage.tsx's management list.
 * `enabled` should be systemInfo.ingressEnabled (see useSystemInfo) -
 * skipping the request entirely, rather than relying on the backend's
 * own "disabled -> empty list" short-circuit (see getIngresses's doc
 * comment), so a deployment that never turns this feature on doesn't
 * even make the round trip on every page load. */
export function useIngresses(enabled: boolean) {
  return useQuery({
    queryKey: ['ingress'],
    queryFn: getIngresses,
    select: (res) => res.entries,
    enabled,
  })
}
