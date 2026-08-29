import { describe, expect, it } from 'vitest'
import {
  blankConsoleServerDeviceFormValues,
  consoleServerDeviceFormToOps,
  consoleServerDeviceToFormValues,
  deleteConsoleServerDeviceOp,
  disableConsoleServerOp,
  enableConsoleServerOp,
} from './serviceConsoleServerForm'
import { blankConsoleServerDevice, type ConsoleServerDevice } from './serviceConsoleServerTypes'

function emptyDevice(overrides: Partial<ConsoleServerDevice> = {}): ConsoleServerDevice {
  return { name: 'ttyS0', ...blankConsoleServerDevice(), ...overrides }
}

describe('consoleServerDeviceFormToOps - creating', () => {
  it('always sets the device tag itself, even with a blank form', () => {
    expect(consoleServerDeviceFormToOps('ttyS0', undefined, blankConsoleServerDeviceFormValues())).toEqual([
      { op: 'set', path: ['service', 'console-server', 'device', 'ttyS0'] },
    ])
  })

  it('queues scalar fields including the nested ssh port', () => {
    const values = blankConsoleServerDeviceFormValues()
    values.speed = '115200'
    values.sshPort = '3001'

    expect(consoleServerDeviceFormToOps('ttyS0', undefined, values)).toEqual([
      { op: 'set', path: ['service', 'console-server', 'device', 'ttyS0'] },
      { op: 'set', path: ['service', 'console-server', 'device', 'ttyS0', 'speed'], value: '115200' },
      { op: 'set', path: ['service', 'console-server', 'device', 'ttyS0', 'ssh', 'port'], value: '3001' },
    ])
  })
})

describe('consoleServerDeviceFormToOps - editing', () => {
  it('queues nothing when unchanged (no base set re-issued)', () => {
    const device = emptyDevice({ speed: '9600' })
    expect(consoleServerDeviceFormToOps('ttyS0', device, consoleServerDeviceToFormValues(device))).toEqual([])
  })
})

describe('deleteConsoleServerDeviceOp', () => {
  it('builds a delete op', () => {
    expect(deleteConsoleServerDeviceOp('ttyS0')).toEqual({
      op: 'delete',
      path: ['service', 'console-server', 'device', 'ttyS0'],
    })
  })
})

describe('enableConsoleServerOp / disableConsoleServerOp', () => {
  it('builds the expected ops', () => {
    expect(enableConsoleServerOp()).toEqual({ op: 'set', path: ['service', 'console-server'] })
    expect(disableConsoleServerOp()).toEqual({ op: 'delete', path: ['service', 'console-server'] })
  })
})
