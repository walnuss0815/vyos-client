import {
  blankDynamicDNSConfig,
  blankDynamicDNSEntry,
  type DynamicDNSConfig,
  type DynamicDNSEntry,
} from './serviceDnsDynamicTypes'
import { isRecord, asString, asStringArray, child } from './configTree'

function parseEntry(name: string, raw: unknown): DynamicDNSEntry {
  const addressRoot = child(raw, 'address')
  const webRoot = child(addressRoot, 'web')
  const interfaceValue = asString(child(addressRoot, 'interface'))
  const webUrl = asString(child(webRoot, 'url'))
  const webSkip = asString(child(webRoot, 'skip'))

  let addressMode: 'interface' | 'web' | undefined
  if (interfaceValue !== undefined) addressMode = 'interface'
  else if (webRoot !== undefined) addressMode = 'web'

  return {
    name,
    ...blankDynamicDNSEntry(),
    description: asString(child(raw, 'description')),
    protocol: asString(child(raw, 'protocol')),
    addressMode,
    addressInterface: interfaceValue,
    addressWebUrl: webUrl,
    addressWebSkip: webSkip,
    ipVersion: asString(child(raw, 'ip-version')),
    hostNames: asStringArray(child(raw, 'host-name')),
    server: asString(child(raw, 'server')),
    zone: asString(child(raw, 'zone')),
    username: asString(child(raw, 'username')),
    hasPassword: child(raw, 'password') !== undefined,
    hasKey: child(raw, 'key') !== undefined,
    ttl: asString(child(raw, 'ttl')),
    waitTime: asString(child(raw, 'wait-time')),
    expiryTime: asString(child(raw, 'expiry-time')),
  }
}

export function parseDynamicDNSConfig(dynamic: unknown): DynamicDNSConfig {
  if (dynamic === undefined) return blankDynamicDNSConfig()
  const nameRoot = child(dynamic, 'name')
  const entries = isRecord(nameRoot)
    ? Object.entries(nameRoot)
        .map(([name, raw]) => parseEntry(name, raw))
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  return {
    entries,
    interval: asString(child(dynamic, 'interval')),
    vrf: asString(child(dynamic, 'vrf')),
  }
}

// --- path builders -----------------------------------------------------

export function dynamicDnsPath(...rest: string[]): string[] {
  return ['service', 'dns', 'dynamic', ...rest]
}

export function dynamicDnsEntryPath(name: string, ...rest: string[]): string[] {
  return dynamicDnsPath('name', name, ...rest)
}
