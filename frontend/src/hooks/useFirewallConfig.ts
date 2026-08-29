import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  parseGlobalOptions,
  parseGroups,
  parseRulesets,
  parseZones,
} from '../lib/firewallParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for every Firewall page: fetches
 * `firewall` once (query key `['config-tree', 'firewall']`, matching
 * the `['config-tree', ...]` prefix PendingChangesBar invalidates
 * after a commit) and derives the typed views each page needs. There
 * is no other cache - this hook doesn't merge in locally-queued
 * pending changes; like the Config Tree page, edits are visible in
 * the Pending Changes bar until committed, then this refetches and
 * shows the real result.
 */
export function useFirewallConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'firewall'],
    queryFn: () => getConfigTree(['firewall']),
  })

  const firewall = query.data?.data

  // React Query returns a stable `data` reference across re-renders
  // when the underlying data hasn't actually changed (structural
  // sharing), so keying on `firewall` here means these four parse
  // passes only re-run when the fetched config actually changes, not
  // on every render of every component that calls this hook.
  const derived = useMemo(
    () => ({
      zones: parseZones(firewall),
      groups: parseGroups(firewall),
      rulesets: parseRulesets(firewall),
      globalOptions: parseGlobalOptions(firewall),
    }),
    [firewall],
  )

  return { ...query, ...derived }
}
