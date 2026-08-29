import { useQuery } from '@tanstack/react-query'
import { getRoutes } from '../lib/vyosApi'
import { useRefetchInterval } from '../store/refreshSettings'

/** Live IPv4 + IPv6 routing tables, shared by the Dashboard preview
 * and the full Routes page. Auto-refreshes per the user's shared
 * refresh-settings preference - routes can change on their own
 * (dynamic routing protocols, link flaps), unlike system info. */
export function useRoutes() {
  const refetchInterval = useRefetchInterval()
  return useQuery({
    queryKey: ['routes'],
    queryFn: getRoutes,
    refetchInterval,
  })
}
