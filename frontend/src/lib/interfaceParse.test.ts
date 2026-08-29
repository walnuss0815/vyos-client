import { describe, expect, it } from 'vitest'
import {
  bondPath,
  bridgePath,
  ethernetPath,
  parseBondInterfaces,
  parseBridgeInterfaces,
  parseEthernetInterfaces,
  parseVrfs,
  vlanPath,
  vrfPath,
} from './interfaceParse'

describe('parseEthernetInterfaces', () => {
  it('parses address, description, mtu, vrf, and mac', () => {
    const interfaces = {
      ethernet: {
        eth0: {
          address: ['192.0.2.1/24', '2001:db8::1/64'],
          description: 'WAN',
          mtu: '1500',
          vrf: 'red',
        },
      },
    }
    expect(parseEthernetInterfaces(interfaces)).toEqual([
      {
        name: 'eth0',
        description: 'WAN',
        disabled: false,
        mac: undefined,
        mtu: 1500,
        addresses: ['192.0.2.1/24', '2001:db8::1/64'],
        vrf: 'red',
        vlans: [],
      },
    ])
  })

  it('normalizes a single-valued address leaf into an array', () => {
    const interfaces = { ethernet: { eth0: { address: 'dhcp' } } }
    expect(parseEthernetInterfaces(interfaces)[0].addresses).toEqual(['dhcp'])
  })

  it('treats presence of the disable flag as disabled, regardless of its value', () => {
    const interfaces = { ethernet: { eth0: { disable: null } } }
    expect(parseEthernetInterfaces(interfaces)[0].disabled).toBe(true)
  })

  it('parses VLAN sub-interfaces, sorted numerically by VLAN ID', () => {
    const interfaces = {
      ethernet: {
        eth0: {
          vif: {
            '20': { description: 'twenty' },
            '5': { description: 'five', address: 'dhcp', disable: null, mac: '00:11:22:33:44:55', mtu: '1400', vrf: 'blue' },
          },
        },
      },
    }
    expect(parseEthernetInterfaces(interfaces)[0].vlans).toEqual([
      {
        vlanId: '5',
        description: 'five',
        disabled: true,
        mac: '00:11:22:33:44:55',
        mtu: 1400,
        addresses: ['dhcp'],
        vrf: 'blue',
      },
      {
        vlanId: '20',
        description: 'twenty',
        disabled: false,
        mac: undefined,
        mtu: undefined,
        addresses: [],
        vrf: undefined,
      },
    ])
  })

  it('sorts interfaces by name', () => {
    const interfaces = { ethernet: { eth1: {}, eth0: {} } }
    expect(parseEthernetInterfaces(interfaces).map((i) => i.name)).toEqual(['eth0', 'eth1'])
  })

  it('returns an empty array when there is no ethernet config at all', () => {
    expect(parseEthernetInterfaces(undefined)).toEqual([])
    expect(parseEthernetInterfaces({})).toEqual([])
  })
})

describe('parseBondInterfaces', () => {
  it('parses mode, hash-policy, primary, lacp-rate, min-links, and members', () => {
    const interfaces = {
      bonding: {
        bond0: {
          mode: 'active-backup',
          'hash-policy': 'layer2+3',
          primary: 'eth2',
          'lacp-rate': 'fast',
          'min-links': '1',
          member: { interface: ['eth2', 'eth3'] },
        },
      },
    }
    const [bond] = parseBondInterfaces(interfaces)
    expect(bond.mode).toBe('active-backup')
    expect(bond.hashPolicy).toBe('layer2+3')
    expect(bond.primary).toBe('eth2')
    expect(bond.lacpRate).toBe('fast')
    expect(bond.minLinks).toBe(1)
    expect(bond.members).toEqual(['eth2', 'eth3'])
  })

  it('defaults mode to 802.3ad when unset (matching VyOS\'s own default)', () => {
    const interfaces = { bonding: { bond0: {} } }
    expect(parseBondInterfaces(interfaces)[0].mode).toBe('802.3ad')
  })

  it('ignores an unrecognized mode/hash-policy/lacp-rate rather than throwing', () => {
    const interfaces = {
      bonding: { bond0: { mode: 'not-a-real-mode', 'hash-policy': 'bogus', 'lacp-rate': 'bogus' } },
    }
    const [bond] = parseBondInterfaces(interfaces)
    expect(bond.mode).toBe('802.3ad')
    expect(bond.hashPolicy).toBeUndefined()
    expect(bond.lacpRate).toBeUndefined()
  })

  it('normalizes a single member into an array', () => {
    const interfaces = { bonding: { bond0: { member: { interface: 'eth2' } } } }
    expect(parseBondInterfaces(interfaces)[0].members).toEqual(['eth2'])
  })

  it('returns an empty array when there is no bonding config at all', () => {
    expect(parseBondInterfaces(undefined)).toEqual([])
  })
})

describe('parseBridgeInterfaces', () => {
  it('parses stp, enable-vlan, protocol, and members with per-member priority/cost', () => {
    const interfaces = {
      bridge: {
        br0: {
          stp: null,
          'enable-vlan': null,
          protocol: '802.1ad',
          member: {
            interface: {
              eth4: { priority: '10', cost: '100' },
              eth5: {},
            },
          },
        },
      },
    }
    const [bridge] = parseBridgeInterfaces(interfaces)
    expect(bridge.stp).toBe(true)
    expect(bridge.vlanAware).toBe(true)
    expect(bridge.vlanProtocol).toBe('802.1ad')
    expect(bridge.members).toEqual([
      { name: 'eth4', priority: 10, cost: 100 },
      { name: 'eth5', priority: undefined, cost: undefined },
    ])
  })

  it('defaults stp/enable-vlan to false and vlanProtocol to undefined when unset', () => {
    const interfaces = { bridge: { br0: {} } }
    const [bridge] = parseBridgeInterfaces(interfaces)
    expect(bridge.stp).toBe(false)
    expect(bridge.vlanAware).toBe(false)
    expect(bridge.vlanProtocol).toBeUndefined()
    expect(bridge.members).toEqual([])
  })

  it('ignores an unrecognized protocol rather than throwing', () => {
    const interfaces = { bridge: { br0: { protocol: 'not-a-real-protocol' } } }
    expect(parseBridgeInterfaces(interfaces)[0].vlanProtocol).toBeUndefined()
  })

  it('returns an empty array when there is no bridge config at all', () => {
    expect(parseBridgeInterfaces(undefined)).toEqual([])
  })
})

describe('parseVrfs', () => {
  it('parses name and table, sorted by name', () => {
    const vrf = { name: { blue: { table: '200' }, red: { table: '100' } } }
    expect(parseVrfs(vrf)).toEqual([
      { name: 'blue', table: '200' },
      { name: 'red', table: '100' },
    ])
  })

  it('returns an empty array when there is no vrf config at all', () => {
    expect(parseVrfs(undefined)).toEqual([])
  })
})

describe('path builders', () => {
  it('ethernetPath', () => {
    expect(ethernetPath('eth0')).toEqual(['interfaces', 'ethernet', 'eth0'])
    expect(ethernetPath('eth0', 'mtu')).toEqual(['interfaces', 'ethernet', 'eth0', 'mtu'])
  })

  it('bondPath', () => {
    expect(bondPath('bond0', 'mode')).toEqual(['interfaces', 'bonding', 'bond0', 'mode'])
  })

  it('bridgePath', () => {
    expect(bridgePath('br0', 'stp')).toEqual(['interfaces', 'bridge', 'br0', 'stp'])
  })

  it('vlanPath nests under its parent path', () => {
    expect(vlanPath(ethernetPath('eth0'), '10', 'description')).toEqual([
      'interfaces',
      'ethernet',
      'eth0',
      'vif',
      '10',
      'description',
    ])
  })

  it('vrfPath', () => {
    expect(vrfPath('red', 'table')).toEqual(['vrf', 'name', 'red', 'table'])
  })
})
