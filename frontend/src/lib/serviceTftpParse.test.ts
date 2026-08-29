import { describe, expect, it } from 'vitest'
import { parseTFTPServerConfig, tftpListenAddressPath, tftpServerPath } from './serviceTftpParse'

describe('parseTFTPServerConfig', () => {
  it('returns a blank, disabled config when absent', () => {
    expect(parseTFTPServerConfig(undefined).enabled).toBe(false)
  })

  it('marks enabled when the node is present, even if empty', () => {
    expect(parseTFTPServerConfig({}).enabled).toBe(true)
  })

  it('parses directory, allow-upload, and port', () => {
    const tftp = { directory: '/srv/tftp', 'allow-upload': {}, port: '6969' }
    const config = parseTFTPServerConfig(tftp)
    expect(config.directory).toBe('/srv/tftp')
    expect(config.allowUpload).toBe(true)
    expect(config.port).toBe('6969')
  })

  it('parses listen-address as a tagNode with an optional vrf child', () => {
    const tftp = { 'listen-address': { '192.0.2.1': { vrf: 'RED' }, '192.0.2.2': {} } }
    const config = parseTFTPServerConfig(tftp)
    expect(config.listenAddresses).toEqual([
      { address: '192.0.2.1', vrf: 'RED' },
      { address: '192.0.2.2', vrf: undefined },
    ])
  })
})

describe('path builders', () => {
  it('builds base and listen-address paths', () => {
    expect(tftpServerPath('directory')).toEqual(['service', 'tftp-server', 'directory'])
    expect(tftpListenAddressPath('192.0.2.1', 'vrf')).toEqual([
      'service',
      'tftp-server',
      'listen-address',
      '192.0.2.1',
      'vrf',
    ])
  })
})
