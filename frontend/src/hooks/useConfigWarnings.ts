import { useMemo } from 'react'
import { evaluateConfigWarnings, type ConfigWarning } from '../lib/configWarnings'
import { useFirewallConfig } from './useFirewallConfig'
import { useServiceConfig } from './useServiceConfig'
import { useSystemConfig } from './useSystemConfig'

/**
 * Runs the data-driven rules in lib/configWarningRules.json (via
 * lib/configWarnings.ts's evaluateConfigWarnings) over three
 * already-independently-fetched config areas (firewall/service/
 * system), for the persistent global banner
 * (components/ConfigWarningsBanner.tsx, wired into Layout.tsx so it's
 * visible from any page).
 *
 * Deliberately calls the same useFirewallConfig/useServiceConfig/
 * useSystemConfig hooks the Firewall/Service/System pages themselves
 * use, rather than fetching or re-parsing anything of its own - each
 * uses its own `['config-tree', ...]` query key, so TanStack Query
 * dedupes/caches identically regardless of whether this hook or a
 * page component (or both, e.g. this one via Layout.tsx plus
 * SystemLayout's own pages) triggers the fetch first. This does mean
 * Layout.tsx (mounted for every authenticated page) now always keeps
 * these three config areas warm in cache, not just when their own
 * pages are visited - an intentional tradeoff for a banner that needs
 * to be evaluable everywhere.
 *
 * `isLoading` is true until all three have loaded at least once -
 * ConfigWarningsBanner.tsx uses it to avoid a flash of "no warnings"
 * before the underlying config has actually arrived.
 */
export function useConfigWarnings(): { warnings: ConfigWarning[]; isLoading: boolean } {
  const firewall = useFirewallConfig()
  const service = useServiceConfig()
  const system = useSystemConfig()

  const isLoading = firewall.isLoading || service.isLoading || system.isLoading

  const warnings = useMemo<ConfigWarning[]>(
    () =>
      evaluateConfigWarnings({
        rulesets: firewall.rulesets,
        ssh: service.ssh,
        https: service.https,
        snmp: service.snmp,
        users: system.users,
      }),
    [firewall.rulesets, service.ssh, service.https, service.snmp, system.users],
  )

  return { warnings, isLoading }
}
