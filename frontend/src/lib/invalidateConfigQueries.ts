import type { QueryClient } from '@tanstack/react-query'

// Everything derived from the router's configuration: the parsed config
// trees (all under the ['config-tree', ...] prefix), the Config Tree
// page's set-commands view, the hostname/version, and the certificate
// expiry list. Live operational data (interfaces, routes, ...) polls on
// its own and is deliberately not listed.
const CONFIG_QUERY_KEYS = [['config-tree'], ['set-commands'], ['system-info'], ['pki-expiry']]

/** Refetches every query that reflects the router's configuration.
 * Call after anything that may have changed it: a commit, a revert when
 * a commit-confirm window runs out, a rollback or an import. */
export function invalidateConfigQueries(queryClient: QueryClient) {
  for (const queryKey of CONFIG_QUERY_KEYS) void queryClient.invalidateQueries({ queryKey })
}
