import { useQuery } from '@tanstack/react-query'
import { getNotifications } from '../lib/vyosApi'

/** How often the notification feed is polled. Deliberately a fixed
 * interval, not tied to the shared refresh-settings preference
 * (store/refreshSettings.ts) that governs live operational data
 * (interfaces, routes): that preference exists so a user can quiet
 * down dashboards that redraw/flicker or reduce request volume, not
 * to silently delay how soon they're told about something like an
 * available container image update. */
const REFETCH_INTERVAL_MS = 30_000

/** Shared `GET /api/notifications` query - the sidebar's unread badge
 * (Layout.tsx) and NotificationsPage.tsx both read this same cached
 * query, so marking something read/dismissed in one place is
 * reflected in the other without a second round trip. */
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
    select: (res) => res.notifications,
    refetchInterval: REFETCH_INTERVAL_MS,
  })
}
