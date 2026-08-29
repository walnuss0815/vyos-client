import { describe, expect, it } from 'vitest'
import {
  consoleServerDevicePath,
  consoleServerPath,
  parseConsoleServerConfig,
} from './serviceConsoleServerParse'

describe('parseConsoleServerConfig', () => {
  it('returns a blank, disabled config when absent', () => {
    expect(parseConsoleServerConfig(undefined).enabled).toBe(false)
  })

  it('marks enabled when the node is present, even if empty', () => {
    expect(parseConsoleServerConfig({}).enabled).toBe(true)
  })

  it('parses a device including its nested ssh port', () => {
    const consoleServer = {
      device: {
        ttyS0: {
          description: 'Main console',
          alias: 'primary',
          speed: '115200',
          'data-bits': '8',
          'stop-bits': '1',
          parity: 'none',
          ssh: { port: '3001' },
        },
      },
    }
    const config = parseConsoleServerConfig(consoleServer)
    expect(config.devices).toEqual([
      {
        name: 'ttyS0',
        description: 'Main console',
        alias: 'primary',
        speed: '115200',
        dataBits: '8',
        stopBits: '1',
        parity: 'none',
        sshPort: '3001',
      },
    ])
  })

  it('accepts USB bus/port topology device names, not just ttyS names', () => {
    const consoleServer = { device: { 'usb1b2p1.1': {} } }
    const config = parseConsoleServerConfig(consoleServer)
    expect(config.devices[0].name).toBe('usb1b2p1.1')
  })
})

describe('path builders', () => {
  it('builds base and device paths', () => {
    expect(consoleServerPath('device')).toEqual(['service', 'console-server', 'device'])
    expect(consoleServerDevicePath('ttyS0', 'speed')).toEqual([
      'service',
      'console-server',
      'device',
      'ttyS0',
      'speed',
    ])
  })
})
