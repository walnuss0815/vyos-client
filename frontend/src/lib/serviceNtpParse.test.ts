import { describe, expect, it } from 'vitest'
import { ntpAllowClientPath, ntpPath, ntpServerPath, parseNTPConfig } from './serviceNtpParse'

describe('parseNTPConfig', () => {
  it('returns a blank config when ntp is absent', () => {
    expect(parseNTPConfig(undefined)).toEqual({
      servers: [],
      allowClientAddresses: [],
      listenAddresses: [],
      sourceAddresses: [],
    })
  })

  it('parses servers with their flags', () => {
    const ntp = {
      server: {
        '0.pool.ntp.org': { prefer: {}, pool: {} },
        '192.0.2.1': { noselect: {}, nts: {}, ptp: {}, interleave: {} },
      },
    }
    const config = parseNTPConfig(ntp)
    expect(config.servers).toEqual([
      {
        address: '0.pool.ntp.org',
        prefer: true,
        pool: true,
        noselect: false,
        nts: false,
        ptp: false,
        interleave: false,
      },
      {
        address: '192.0.2.1',
        prefer: false,
        pool: false,
        noselect: true,
        nts: true,
        ptp: true,
        interleave: true,
      },
    ])
  })

  it('parses multi-valued allow-client address, listen-address, and source-address', () => {
    const ntp = {
      'allow-client': { address: ['192.0.2.0/24'] },
      'listen-address': ['192.0.2.1'],
      'source-address': ['192.0.2.1', '2001:db8::1'],
    }
    const config = parseNTPConfig(ntp)
    expect(config.allowClientAddresses).toEqual(['192.0.2.0/24'])
    expect(config.listenAddresses).toEqual(['192.0.2.1'])
    expect(config.sourceAddresses).toEqual(['192.0.2.1', '2001:db8::1'])
  })

  it('parses single-valued interface, source-interface, vrf, leap-second, and local-stratum', () => {
    const ntp = {
      interface: 'eth0',
      'source-interface': 'eth1',
      vrf: 'RED',
      'leap-second': 'smear',
      'local-stratum': '5',
    }
    const config = parseNTPConfig(ntp)
    expect(config.interface).toBe('eth0')
    expect(config.sourceInterface).toBe('eth1')
    expect(config.vrf).toBe('RED')
    expect(config.leapSecond).toBe('smear')
    expect(config.localStratum).toBe('5')
  })
})

describe('path builders', () => {
  it('builds an ntp base path', () => {
    expect(ntpPath('leap-second')).toEqual(['service', 'ntp', 'leap-second'])
  })

  it('builds a server path', () => {
    expect(ntpServerPath('192.0.2.1', 'prefer')).toEqual(['service', 'ntp', 'server', '192.0.2.1', 'prefer'])
  })

  it('builds an allow-client path', () => {
    expect(ntpAllowClientPath('address')).toEqual(['service', 'ntp', 'allow-client', 'address'])
  })
})
