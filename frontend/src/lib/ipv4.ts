/**
 * Small IPv4 arithmetic helpers - just enough to size a DHCP range for
 * the pool-utilization bars on the DHCP Networks tab (see
 * lib/dhcpPoolUtilization.ts). Not a general-purpose IP library; no
 * IPv6, no CIDR parsing.
 */

/** Parses a dotted-quad IPv4 address into its 32-bit integer form.
 * Returns undefined for anything that isn't exactly 4 valid octets
 * (0-255) - deliberately strict, since a malformed range boundary
 * should degrade to "can't size this range" rather than silently
 * producing a wrong number. */
export function ipv4ToInt(address: string): number | undefined {
  const parts = address.trim().split('.')
  if (parts.length !== 4) return undefined

  let result = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined
    const octet = Number(part)
    if (octet > 255) return undefined
    result = result * 256 + octet
  }
  return result
}

/** The number of addresses from `start` to `stop`, inclusive. Returns
 * 0 if either bound doesn't parse, or if stop is before start (rather
 * than a negative number a caller might accidentally sum in). */
export function ipv4RangeSize(start: string, stop: string): number {
  const startInt = ipv4ToInt(start)
  const stopInt = ipv4ToInt(stop)
  if (startInt === undefined || stopInt === undefined || stopInt < startInt) return 0
  return stopInt - startInt + 1
}

/** Strict IPv4 dotted-quad format check (no CIDR suffix, no
 * whitespace-tolerant leniency beyond ipv4ToInt's own trimming) - for
 * validating a plain address field (e.g. a static-mapping's IP), not a
 * network/CIDR field (which uses its own regex - see
 * NetworksPage.tsx/NetworkCard.tsx). */
export function isValidIpv4(address: string): boolean {
  return ipv4ToInt(address) !== undefined
}

/** Whether `address` falls within [start, stop], inclusive. Returns
 * false (not "unknown") if any of the three fail to parse - this is
 * used for an advisory warning (see
 * dhcpPoolUtilization.ts's isAddressInDynamicRange), not a validator,
 * so a malformed range simply doesn't trigger it rather than being
 * treated as a match. */
export function isIpv4InRange(address: string, start: string, stop: string): boolean {
  const addrInt = ipv4ToInt(address)
  const startInt = ipv4ToInt(start)
  const stopInt = ipv4ToInt(stop)
  if (addrInt === undefined || startInt === undefined || stopInt === undefined) return false
  return addrInt >= startInt && addrInt <= stopInt
}
