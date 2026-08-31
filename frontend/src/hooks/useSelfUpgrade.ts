import { useQuery } from '@tanstack/react-query'
import { getSelfUpgradeStatus } from '../lib/vyosApi'

/** Backs UpgradesPage.tsx. Deliberately not auto-refreshing and given
 * a long staleTime: the backend itself caches GitHub's response for a
 * while (internal/selfupgrade.Client), but there's no reason for the
 * frontend to even ask again every time this page is visited within a
 * session - a manual "Refresh" button on the page triggers an explicit
 * refetch instead. This keeps requests to GitHub's rate-limited
 * unauthenticated API infrequent. */
export function useSelfUpgrade() {
  return useQuery({
    queryKey: ['self-upgrade'],
    queryFn: getSelfUpgradeStatus,
    staleTime: 15 * 60 * 1000,
  })
}
