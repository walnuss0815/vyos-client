import { describe, expect, it } from 'vitest'
import { isEthernetInterface, isPhysicalInterface, isVlanInterface } from './interfaceType'

describe('isPhysicalInterface', () => {
  it.each(['eth0', 'eth12', 'lan0', 'eno1', 'ens3', 'enp0s3', 'enx001122334455', 'wlan0', 'wwan0'])(
    'treats %s as physical',
    (name) => {
      expect(isPhysicalInterface(name)).toBe(true)
    },
  )

  it.each(['bond0', 'br0', 'dum0', 'lo', 'tun0', 'veth0', 'vti0', 'vtun0', 'vxlan0', 'wg0', 'pppoe0'])(
    'treats %s as virtual, not physical',
    (name) => {
      expect(isPhysicalInterface(name)).toBe(false)
    },
  )

  it('treats a VLAN sub-interface on a physical parent as not physical', () => {
    expect(isPhysicalInterface('eth0.10')).toBe(false)
  })

  it('requires a numeric suffix', () => {
    expect(isPhysicalInterface('eth')).toBe(false)
    expect(isPhysicalInterface('ethfoo')).toBe(false)
  })
})

describe('isEthernetInterface', () => {
  it.each(['eth0', 'lan0', 'eno1', 'ens3', 'enp0s3', 'enx001122334455'])(
    'treats %s as ethernet',
    (name) => {
      expect(isEthernetInterface(name)).toBe(true)
    },
  )

  it('does not treat WiFi or WWAN interfaces as ethernet, unlike isPhysicalInterface', () => {
    expect(isEthernetInterface('wlan0')).toBe(false)
    expect(isEthernetInterface('wwan0')).toBe(false)
    expect(isPhysicalInterface('wlan0')).toBe(true)
    expect(isPhysicalInterface('wwan0')).toBe(true)
  })

  it('treats virtual interfaces as not ethernet', () => {
    expect(isEthernetInterface('bond0')).toBe(false)
    expect(isEthernetInterface('br0')).toBe(false)
  })
})

describe('isVlanInterface', () => {
  it('treats a dot-suffixed name as a VLAN sub-interface', () => {
    expect(isVlanInterface('eth0.10')).toBe(true)
    expect(isVlanInterface('bond0.20')).toBe(true)
  })

  it('treats a plain name as not a VLAN sub-interface', () => {
    expect(isVlanInterface('eth0')).toBe(false)
    expect(isVlanInterface('bond0')).toBe(false)
    expect(isVlanInterface('lo')).toBe(false)
  })
})
