import { describe, expect, it } from 'vitest'
import {
  lldpInterfaceCoordinatePath,
  lldpInterfaceElinPath,
  lldpInterfacePath,
  lldpPath,
  parseLLDPConfig,
} from './serviceLldpParse'

describe('parseLLDPConfig', () => {
  it('returns a blank, disabled config when absent', () => {
    expect(parseLLDPConfig(undefined).enabled).toBe(false)
  })

  it('marks enabled when the node is present, even if empty', () => {
    expect(parseLLDPConfig({}).enabled).toBe(true)
  })

  it('parses interfaces with mode and location', () => {
    const lldp = {
      interface: {
        eth0: {
          mode: 'rx',
          location: {
            'coordinate-based': { altitude: '10', datum: 'WGS84', latitude: '37.5N', longitude: '122.2W' },
            elin: '911',
          },
        },
        all: { mode: 'disable' },
      },
    }
    const config = parseLLDPConfig(lldp)
    expect(config.interfaces).toEqual([
      { interfaceName: 'all', mode: 'disable', location: { altitude: undefined, datum: undefined, latitude: undefined, longitude: undefined, elin: undefined } },
      {
        interfaceName: 'eth0',
        mode: 'rx',
        location: { altitude: '10', datum: 'WGS84', latitude: '37.5N', longitude: '122.2W', elin: '911' },
      },
    ])
  })

  it('parses legacy-protocols, management-address, and snmp', () => {
    const lldp = {
      'legacy-protocols': { cdp: {}, edp: {}, fdp: {}, sonmp: {} },
      'management-address': ['192.0.2.1'],
      snmp: {},
    }
    const config = parseLLDPConfig(lldp)
    expect(config.legacyCdp).toBe(true)
    expect(config.legacyEdp).toBe(true)
    expect(config.legacyFdp).toBe(true)
    expect(config.legacySonmp).toBe(true)
    expect(config.managementAddresses).toEqual(['192.0.2.1'])
    expect(config.snmp).toBe(true)
  })
})

describe('path builders', () => {
  it('builds base and interface paths', () => {
    expect(lldpPath('snmp')).toEqual(['service', 'lldp', 'snmp'])
    expect(lldpInterfacePath('eth0', 'mode')).toEqual(['service', 'lldp', 'interface', 'eth0', 'mode'])
  })

  it('builds coordinate and elin paths', () => {
    expect(lldpInterfaceCoordinatePath('eth0', 'altitude')).toEqual([
      'service',
      'lldp',
      'interface',
      'eth0',
      'location',
      'coordinate-based',
      'altitude',
    ])
    expect(lldpInterfaceElinPath('eth0')).toEqual([
      'service',
      'lldp',
      'interface',
      'eth0',
      'location',
      'elin',
    ])
  })
})
