import { describe, expect, it } from 'vitest'
import {
  blankBondFormValues,
  blankBridgeFormValues,
  blankEthernetFormValues,
  blankVlanFormValues,
  bondFormToOps,
  bondToFormValues,
  bridgeFormToOps,
  bridgeToFormValues,
  ethernetFormToOps,
  ethernetToFormValues,
  vlanFormToOps,
  vlanToFormValues,
} from './interfaceConfigForm'
import { ethernetPath } from './interfaceParse'
import type { BondInterface, BridgeInterface, EthernetInterface, InterfaceVlan } from './interfaceTypes'

function ethernet(overrides: Partial<EthernetInterface> = {}): EthernetInterface {
  return { name: 'eth0', disabled: false, addresses: [], vlans: [], ...overrides }
}

function bond(overrides: Partial<BondInterface> = {}): BondInterface {
  return { name: 'bond0', disabled: false, addresses: [], mode: '802.3ad', members: [], vlans: [], ...overrides }
}

function bridge(overrides: Partial<BridgeInterface> = {}): BridgeInterface {
  return {
    name: 'br0',
    disabled: false,
    addresses: [],
    stp: false,
    vlanAware: false,
    members: [],
    vlans: [],
    ...overrides,
  }
}

function vlan(overrides: Partial<InterfaceVlan> = {}): InterfaceVlan {
  return { vlanId: '10', disabled: false, addresses: [], ...overrides }
}

describe('ethernetFormToOps', () => {
  it('queues only the fields the user filled in when creating (before = undefined)', () => {
    const values = blankEthernetFormValues()
    values.description = 'WAN'
    values.mtu = '1600'

    const ops = ethernetFormToOps('eth0', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['interfaces', 'ethernet', 'eth0', 'description'], value: 'WAN' },
        { op: 'set', path: ['interfaces', 'ethernet', 'eth0', 'mtu'], value: '1600' },
      ]),
    )
    expect(ops).toHaveLength(2)
  })

  it('queues nothing when the form is unchanged', () => {
    const iface = ethernet({ description: 'WAN', mtu: 1500, vrf: 'red' })
    expect(ethernetFormToOps('eth0', iface, ethernetToFormValues(iface))).toEqual([])
  })

  it('queues only the changed field', () => {
    const iface = ethernet({ description: 'WAN' })
    const values = ethernetToFormValues(iface)
    values.description = 'WAN (renamed)'

    expect(ethernetFormToOps('eth0', iface, values)).toEqual([
      { op: 'set', path: ['interfaces', 'ethernet', 'eth0', 'description'], value: 'WAN (renamed)' },
    ])
  })

  it('queues a delete when a previously-set field is cleared', () => {
    const iface = ethernet({ vrf: 'red' })
    const values = ethernetToFormValues(iface)
    values.vrf = ''

    expect(ethernetFormToOps('eth0', iface, values)).toEqual([
      { op: 'delete', path: ['interfaces', 'ethernet', 'eth0', 'vrf'] },
    ])
  })

  it('queues a flag set/delete for disabled', () => {
    const iface = ethernet()
    const enabling = ethernetToFormValues(iface)
    enabling.disabled = true
    expect(ethernetFormToOps('eth0', iface, enabling)).toEqual([
      { op: 'set', path: ['interfaces', 'ethernet', 'eth0', 'disable'] },
    ])

    const disabledIface = ethernet({ disabled: true })
    const enablingBack = ethernetToFormValues(disabledIface)
    enablingBack.disabled = false
    expect(ethernetFormToOps('eth0', disabledIface, enablingBack)).toEqual([
      { op: 'delete', path: ['interfaces', 'ethernet', 'eth0', 'disable'] },
    ])
  })
})

describe('vlanFormToOps', () => {
  it('nests under the parent interface path plus vif/<id>', () => {
    const values = blankVlanFormValues()
    values.description = 'Guest'

    const ops = vlanFormToOps(ethernetPath('eth0'), '20', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['interfaces', 'ethernet', 'eth0', 'vif', '20', 'description'], value: 'Guest' },
    ])
  })

  it('queues nothing when unchanged', () => {
    const v = vlan({ description: 'Guest', mtu: 1400 })
    expect(vlanFormToOps(ethernetPath('eth0'), '20', v, vlanToFormValues(v))).toEqual([])
  })
})

describe('bondFormToOps', () => {
  it('queues bond-specific fields alongside common ones', () => {
    const values = blankBondFormValues()
    values.mode = 'active-backup'
    values.primary = 'eth2'
    values.hashPolicy = 'layer2+3'

    const ops = bondFormToOps('bond0', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['interfaces', 'bonding', 'bond0', 'mode'], value: 'active-backup' },
        { op: 'set', path: ['interfaces', 'bonding', 'bond0', 'primary'], value: 'eth2' },
        { op: 'set', path: ['interfaces', 'bonding', 'bond0', 'hash-policy'], value: 'layer2+3' },
      ]),
    )
  })

  it('does not queue mode when it is unchanged from the default (802.3ad)', () => {
    // blankBondFormValues() defaults mode to '802.3ad', matching
    // VyOS's own default when the field is absent from config - so a
    // brand new bond with no explicit mode choice shouldn't emit a
    // redundant `set ... mode 802.3ad`.
    const ops = bondFormToOps('bond0', undefined, blankBondFormValues())
    expect(ops).toEqual([])
  })

  it('queues nothing when editing an existing bond with no changes', () => {
    const b = bond({ mode: 'active-backup', primary: 'eth2', minLinks: 1 })
    expect(bondFormToOps('bond0', b, bondToFormValues(b))).toEqual([])
  })

  it('queues a delete for min-links when cleared', () => {
    const b = bond({ minLinks: 2 })
    const values = bondToFormValues(b)
    values.minLinks = ''
    expect(bondFormToOps('bond0', b, values)).toEqual([
      { op: 'delete', path: ['interfaces', 'bonding', 'bond0', 'min-links'] },
    ])
  })
})

describe('bridgeFormToOps', () => {
  it('queues stp/enable-vlan as flags and protocol as a scalar', () => {
    const values = blankBridgeFormValues()
    values.stp = true
    values.vlanAware = true
    values.vlanProtocol = '802.1ad'

    const ops = bridgeFormToOps('br0', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['interfaces', 'bridge', 'br0', 'stp'] },
        { op: 'set', path: ['interfaces', 'bridge', 'br0', 'enable-vlan'] },
        { op: 'set', path: ['interfaces', 'bridge', 'br0', 'protocol'], value: '802.1ad' },
      ]),
    )
  })

  it('queues nothing when editing an existing bridge with no changes', () => {
    const br = bridge({ stp: true, vlanAware: true, vlanProtocol: '802.1ad' })
    expect(bridgeFormToOps('br0', br, bridgeToFormValues(br))).toEqual([])
  })

  it('queues a flag delete when stp is turned off', () => {
    const br = bridge({ stp: true })
    const values = bridgeToFormValues(br)
    values.stp = false
    expect(bridgeFormToOps('br0', br, values)).toEqual([
      { op: 'delete', path: ['interfaces', 'bridge', 'br0', 'stp'] },
    ])
  })
})
