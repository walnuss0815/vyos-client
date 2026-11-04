import { blankMdnsRepeaterConfig, type MdnsRepeaterConfig } from './serviceMdnsTypes'
import { asString, asStringArray, child, isFlagPresent } from './configTree'

export function parseMdnsRepeaterConfig(repeater: unknown): MdnsRepeaterConfig {
  if (repeater === undefined) return blankMdnsRepeaterConfig()
  return {
    enabled: true,
    disabled: isFlagPresent(repeater, 'disable'),
    interfaces: asStringArray(child(repeater, 'interface')),
    ipVersion: asString(child(repeater, 'ip-version')),
    browseDomains: asStringArray(child(repeater, 'browse-domain')),
    allowServices: asStringArray(child(repeater, 'allow-service')),
    cacheEntries: asString(child(repeater, 'cache-entries')),
    vrrpDisable: isFlagPresent(repeater, 'vrrp-disable'),
  }
}

// --- path builders -----------------------------------------------------

export function mdnsRepeaterPath(...rest: string[]): string[] {
  return ['service', 'mdns', 'repeater', ...rest]
}
