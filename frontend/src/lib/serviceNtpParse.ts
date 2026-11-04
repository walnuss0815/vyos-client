import { blankNTPConfig, type NTPConfig, type NTPServer } from './serviceNtpTypes'
import { isRecord, asString, asStringArray, child, isFlagPresent } from './configTree'

function parseServer(address: string, raw: unknown): NTPServer {
  return {
    address,
    prefer: isFlagPresent(raw, 'prefer'),
    pool: isFlagPresent(raw, 'pool'),
    noselect: isFlagPresent(raw, 'noselect'),
    nts: isFlagPresent(raw, 'nts'),
    ptp: isFlagPresent(raw, 'ptp'),
    interleave: isFlagPresent(raw, 'interleave'),
  }
}

function parseServers(ntp: unknown): NTPServer[] {
  const root = child(ntp, 'server')
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(([address, raw]) => parseServer(address, raw))
    .sort((a, b) => a.address.localeCompare(b.address))
}

export function parseNTPConfig(ntp: unknown): NTPConfig {
  if (ntp === undefined) return blankNTPConfig()
  return {
    servers: parseServers(ntp),
    allowClientAddresses: asStringArray(child(child(ntp, 'allow-client'), 'address')),
    listenAddresses: asStringArray(child(ntp, 'listen-address')),
    sourceAddresses: asStringArray(child(ntp, 'source-address')),
    interface: asString(child(ntp, 'interface')),
    sourceInterface: asString(child(ntp, 'source-interface')),
    vrf: asString(child(ntp, 'vrf')),
    leapSecond: asString(child(ntp, 'leap-second')),
    localStratum: asString(child(ntp, 'local-stratum')),
  }
}

// --- path builders -----------------------------------------------------

export function ntpPath(...rest: string[]): string[] {
  return ['service', 'ntp', ...rest]
}

export function ntpServerPath(address: string, ...rest: string[]): string[] {
  return ntpPath('server', address, ...rest)
}

export function ntpAllowClientPath(...rest: string[]): string[] {
  return ntpPath('allow-client', ...rest)
}
