import { useQuery } from '@tanstack/react-query'
import { getSelfUpgradeStatus } from '../lib/vyosApi'

/** Backs UpgradesPage.tsx. Deliberately not auto-refreshing and given
 * a long staleTime: the backend itself caches GitHub's response for a
 * while (internal/selfupgrade.Client), but there's no reason for the
 * frontend to even ask again every time this page is visited within a
 * session - this keeps requests to GitHub's rate-limited
 * unauthenticated API infrequent.
 *
 * The page's manual "Refresh" button does NOT go through this hook's
 * own queryFn (which would still be served from the backend's cache,
 * same as any other call to plain getSelfUpgradeStatus()) - it calls
 * getSelfUpgradeStatus(true) directly to bypass that cache entirely,
 * then writes the fresh result straight into this query's cache
 * (queryClient.setQueryData) - see UpgradesPage.tsx's handleRefresh. */
export function useSelfUpgrade() {
  return useQuery({
    queryKey: ['self-upgrade'],
    // Explicit no-args call (not just `getSelfUpgradeStatus` as a bare
    // reference) - that function now takes an optional `force`
    // parameter for the "Refresh" button's own direct call
    // (UpgradesPage.tsx), which TanStack Query would otherwise try to
    // satisfy with its own QueryFunctionContext argument instead.
    queryFn: () => getSelfUpgradeStatus(),
    staleTime: 15 * 60 * 1000,
  })
}
