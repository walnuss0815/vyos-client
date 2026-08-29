import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { parseQosConfig } from '../lib/qosParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for every Traffic Policy / QoS tab (Policies,
 * Interfaces, Match Groups): fetches `qos` once (query key
 * `['config-tree', 'qos']`) and derives every typed view - same "one
 * fetch, several derived lists" shape as useFirewallConfig()/
 * useLoadBalancingConfig(). Every policy type's list, the interface
 * bindings, and the reusable match groups all come from this single
 * hook, which is what lets the interface-binding picker and a class's
 * match-group reference both be real dropdowns fed by sibling data
 * from the same fetch (the pattern Load-balancing's HAProxy backend
 * picker introduced).
 */
export function useQosConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'qos'],
    queryFn: () => getConfigTree(['qos']),
  })

  const qos = query.data?.data

  const derived = useMemo(() => parseQosConfig(qos), [qos])

  return { ...query, ...derived }
}
