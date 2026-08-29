import type { DHCPSharedNetwork, DHCPSubnet } from './dhcpConfigTypes'
import { ipv4RangeSize, isIpv4InRange } from './ipv4'
import type { DHCPLease } from './vyosApi'

export interface PoolUtilization {
  /** Total addresses across every range in every subnet of this
   * shared network. Deliberately doesn't subtract `exclude`d
   * addresses - a known, deliberate simplification (see
   * lib/ipv4.ts's doc comment) for what's meant to be an
   * at-a-glance bar, not an exact count. */
  size: number
  /** Currently-active leases whose pool matches this network's name. */
  leased: number
  available: number
  /** 0-100, rounded; 0 when size is 0 (nothing to divide by, and
   * nothing to warn about either). */
  usagePercent: number
}

/**
 * Combines a shared network's configured range sizes with the live
 * lease count for its pool (from GET /api/dhcp/leases, already fetched
 * for the Leases tab - see hooks/useDHCPLeases.ts) into the numbers
 * the Networks tab's pool-utilization bar needs. `leases` should be
 * the full lease list; this filters by `lease.pool === network.name`
 * itself, so callers don't need to pre-group them (unlike
 * lib/dhcpLeases.ts's groupLeasesByPool, which groups for display, not
 * for this calculation).
 */
export function computePoolUtilization(network: DHCPSharedNetwork, leases: DHCPLease[]): PoolUtilization {
  const size = network.subnets
    .flatMap((subnet) => subnet.ranges)
    .reduce((sum, range) => sum + (range.start && range.stop ? ipv4RangeSize(range.start, range.stop) : 0), 0)

  const leased = leases.filter((lease) => lease.pool === network.name).length
  const available = Math.max(size - leased, 0)
  const usagePercent = size > 0 ? Math.min(100, Math.round((leased / size) * 100)) : 0

  return { size, leased, available, usagePercent }
}

/**
 * Whether `address` falls inside one of `subnet`'s own dynamic ranges
 * and isn't individually excluded - a static mapping using such an
 * address risks a future (or even current) collision with a
 * dynamically-leased client, since neither this app nor VyOS itself
 * prevents choosing one. Used by MakeStaticModal.tsx/
 * StaticMappingSection.tsx as an advisory warning, not a hard
 * validation error - a malformed range boundary or an unparsable
 * address simply doesn't trigger it (see isIpv4InRange's own doc
 * comment), matching this check's "nice to flag, not worth blocking
 * submission over" role.
 */
export function isAddressInDynamicRange(
  address: string,
  subnet: Pick<DHCPSubnet, 'ranges' | 'excludes'>,
): boolean {
  const trimmed = address.trim()
  if (trimmed === '' || subnet.excludes.some((ex) => ex.trim() === trimmed)) return false
  return subnet.ranges.some(
    (range) => range.start !== undefined && range.stop !== undefined && isIpv4InRange(trimmed, range.start, range.stop),
  )
}
