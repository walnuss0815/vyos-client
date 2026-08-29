import type { DHCPSharedNetwork, DHCPStaticMapping, DHCPSubnet } from './dhcpConfigTypes'
import { isValidVyOSIdentifier } from './vyosIdentifier'
import type { DHCPLease } from './vyosApi'

/** The configured subnet a lease falls under (matched by
 * `lease.pool`/`lease.subnet` against `sharedNetworks`' `name`/
 * `cidr`), shared by existingStaticMappingNames/findStaticMapping
 * below - also exported directly for MakeStaticModal.tsx, which needs
 * the subnet's own `ranges`/`excludes` (not just names/mappings) for
 * its dynamic-range-collision warning (see
 * dhcpPoolUtilization.ts's isAddressInDynamicRange). `undefined` if
 * the lease's subnet couldn't be resolved or isn't found in
 * `sharedNetworks`. */
export function subnetForLease(lease: DHCPLease, sharedNetworks: DHCPSharedNetwork[]): DHCPSubnet | undefined {
  if (!lease.subnet) return undefined
  const network = sharedNetworks.find((n) => n.name === lease.pool)
  return network?.subnets.find((s) => s.cidr === lease.subnet)
}

/**
 * Suggests a `static-mapping <name>` identifier for a lease: the
 * lease's own hostname if it's a valid VyOS identifier, otherwise a
 * name derived from its MAC address.
 *
 * DHCP client hostnames are usually already valid VyOS identifiers,
 * but aren't guaranteed to be (can contain spaces, dots, or other
 * characters VyOS identifiers don't allow), and the leases table's "-"
 * placeholder for an unknown hostname obviously isn't a usable name
 * either - falling back to a MAC-derived name keeps "make static"
 * always available rather than silently failing on an unusual
 * hostname.
 */
export function suggestStaticMappingName(lease: DHCPLease): string {
  const hostname = lease.hostname.trim()
  if (hostname && hostname !== '-' && isValidVyOSIdentifier(hostname)) {
    return hostname
  }
  return `device-${lease.macAddress.replace(/[^0-9a-fA-F]/g, '').toLowerCase()}`
}

/**
 * The names of static mappings already configured under the subnet a
 * lease falls under (matched by `lease.pool`/`lease.subnet` against
 * `sharedNetworks`' `name`/`cidr`) - used by DHCPLeasesTable's "Make
 * static" flow (MakeStaticModal.tsx) to reject a name collision the
 * same way StaticMappingSection.tsx's own create form does. Returns
 * an empty array (nothing to collide with, but also nothing to
 * validate the suggested name against) if the lease's subnet couldn't
 * be resolved or isn't found in `sharedNetworks`.
 */
export function existingStaticMappingNames(
  lease: DHCPLease,
  sharedNetworks: DHCPSharedNetwork[],
): string[] {
  const subnet = subnetForLease(lease, sharedNetworks)
  return subnet ? subnet.staticMappings.map((m) => m.name) : []
}

/**
 * The existing static mapping a lease already corresponds to, if any
 * - matched by MAC address (case-insensitively; VyOS doesn't enforce
 * a canonical case for MACs and leases/mappings could disagree on it)
 * within the lease's own subnet (see subnetForLease above). Leases
 * don't carry a DUID of their own, so DUID-only mappings can never
 * match here - only mac-identified ones can.
 *
 * Used by DHCPLeasesTable.tsx to show "Edit" instead of "Make static"
 * for a lease that's already reserved: VyOS's lease data has no
 * static/dynamic flag of its own (`DHCPLease.origin` is "local" vs.
 * "remote" - an HA-failover-peer distinction, not this one) - a
 * statically-reserved client's lease looks identical to a dynamic
 * one once it's actually leased, so this is the only way to tell.
 */
export function findStaticMapping(
  lease: DHCPLease,
  sharedNetworks: DHCPSharedNetwork[],
): DHCPStaticMapping | undefined {
  const mac = lease.macAddress.trim().toLowerCase()
  if (!mac) return undefined
  const subnet = subnetForLease(lease, sharedNetworks)
  return subnet?.staticMappings.find((m) => m.mac?.trim().toLowerCase() === mac)
}

function staticMappingIndexKey(poolName: string, cidr: string, mac: string): string {
  // \0 can't appear in a pool name or CIDR (VyOS identifiers/CIDR
  // syntax don't allow it), so this can't produce a false collision
  // between e.g. pool="A", cidr="B|mac" and pool="A|B", cidr="mac"
  // the way a plain "|"-joined key could for sufficiently unusual
  // (if VyOS-illegal) input.
  return `${poolName}\0${cidr}\0${mac}`
}

/**
 * Precomputes findStaticMapping's lookup across every subnet in
 * sharedNetworks into a single Map, keyed by (pool, subnet CIDR, mac).
 * DHCPLeasesTable.tsx builds this once (via useMemo, keyed on
 * sharedNetworks) rather than once per lease per render -
 * findStaticMapping itself does a network/subnet/mapping linear scan
 * on every call, which is fine for a handful of leases but adds up
 * once a pool holds hundreds/thousands of them (VyOS itself has no
 * hard limit on DHCP pool size).
 */
export function buildStaticMappingIndex(sharedNetworks: DHCPSharedNetwork[]): Map<string, DHCPStaticMapping> {
  const index = new Map<string, DHCPStaticMapping>()
  for (const network of sharedNetworks) {
    for (const subnet of network.subnets) {
      for (const mapping of subnet.staticMappings) {
        const mac = mapping.mac?.trim().toLowerCase()
        if (!mac) continue // DUID-only mappings can never match a lease - see findStaticMapping's doc comment
        index.set(staticMappingIndexKey(network.name, subnet.cidr, mac), mapping)
      }
    }
  }
  return index
}

/**
 * findStaticMapping's exact matching semantics (MAC, case-insensitive,
 * within the lease's own pool/subnet), but via a precomputed index
 * (see buildStaticMappingIndex) instead of a fresh linear scan per
 * call - O(1) once the index exists.
 */
export function findStaticMappingIndexed(
  lease: DHCPLease,
  index: Map<string, DHCPStaticMapping>,
): DHCPStaticMapping | undefined {
  const mac = lease.macAddress.trim().toLowerCase()
  if (!mac || !lease.pool || !lease.subnet) return undefined
  return index.get(staticMappingIndexKey(lease.pool, lease.subnet, mac))
}

/** Label used for leases whose pool couldn't be determined (an empty
 * `pool` string) when grouping leases by pool. */
export const UNKNOWN_POOL_LABEL = 'Unknown'

export interface DHCPLeaseGroup {
  pool: string
  leases: DHCPLease[]
}

/**
 * Groups leases by their DHCP pool (VyOS's `shared-network-name`),
 * sorted alphabetically by pool name - leases with no resolved pool
 * are grouped under UNKNOWN_POOL_LABEL, sorted like any other group
 * name (so it doesn't necessarily land first or last).
 */
export function groupLeasesByPool(leases: DHCPLease[]): DHCPLeaseGroup[] {
  const groups = new Map<string, DHCPLease[]>()
  for (const lease of leases) {
    const pool = lease.pool.trim() || UNKNOWN_POOL_LABEL
    const group = groups.get(pool)
    if (group) {
      group.push(lease)
    } else {
      groups.set(pool, [lease])
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pool, poolLeases]) => ({ pool, leases: poolLeases }))
}
