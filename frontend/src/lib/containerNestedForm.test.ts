import { describe, expect, it } from 'vitest'
import {
  addDeviceOps,
  addNetworkAttachmentOps,
  addPortOps,
  addTmpfsOps,
  addVolumeOps,
  blankHealthCheckFormValues,
  healthCheckFormToOps,
  healthCheckToFormValues,
  removeDeviceOp,
  removeNetworkAttachmentOp,
  removePortOp,
  removeTmpfsOp,
  removeVolumeOp,
} from './containerNestedForm'

describe('device ops', () => {
  it('queues source and destination', () => {
    expect(addDeviceOps('web', 'dev0', '/dev/net/tun', '/dev/net/tun')).toEqual([
      { op: 'set', path: ['container', 'name', 'web', 'device', 'dev0', 'source'], value: '/dev/net/tun' },
      {
        op: 'set',
        path: ['container', 'name', 'web', 'device', 'dev0', 'destination'],
        value: '/dev/net/tun',
      },
    ])
  })

  it('omits blank fields', () => {
    expect(addDeviceOps('web', 'dev0', '', '')).toEqual([])
  })

  it('builds a remove op', () => {
    expect(removeDeviceOp('web', 'dev0')).toEqual({
      op: 'delete',
      path: ['container', 'name', 'web', 'device', 'dev0'],
    })
  })
})

describe('port ops', () => {
  it('queues source, destination, and protocol', () => {
    expect(addPortOps('web', 'http', '8080', '80', 'tcp')).toEqual([
      { op: 'set', path: ['container', 'name', 'web', 'port', 'http', 'source'], value: '8080' },
      { op: 'set', path: ['container', 'name', 'web', 'port', 'http', 'destination'], value: '80' },
      { op: 'set', path: ['container', 'name', 'web', 'port', 'http', 'protocol'], value: 'tcp' },
    ])
  })

  it('omits blank protocol', () => {
    expect(addPortOps('web', 'http', '8080', '80', '')).toEqual([
      { op: 'set', path: ['container', 'name', 'web', 'port', 'http', 'source'], value: '8080' },
      { op: 'set', path: ['container', 'name', 'web', 'port', 'http', 'destination'], value: '80' },
    ])
  })

  it('builds a remove op', () => {
    expect(removePortOp('web', 'http')).toEqual({
      op: 'delete',
      path: ['container', 'name', 'web', 'port', 'http'],
    })
  })
})

describe('volume ops', () => {
  it('queues source, destination, mode, and propagation', () => {
    expect(addVolumeOps('web', 'data', '/mnt/data', '/data', 'ro', 'rslave')).toEqual([
      { op: 'set', path: ['container', 'name', 'web', 'volume', 'data', 'source'], value: '/mnt/data' },
      { op: 'set', path: ['container', 'name', 'web', 'volume', 'data', 'destination'], value: '/data' },
      { op: 'set', path: ['container', 'name', 'web', 'volume', 'data', 'mode'], value: 'ro' },
      { op: 'set', path: ['container', 'name', 'web', 'volume', 'data', 'propagation'], value: 'rslave' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeVolumeOp('web', 'data')).toEqual({
      op: 'delete',
      path: ['container', 'name', 'web', 'volume', 'data'],
    })
  })
})

describe('tmpfs ops', () => {
  it('queues destination and size', () => {
    expect(addTmpfsOps('web', 't0', '/tmp', '64')).toEqual([
      { op: 'set', path: ['container', 'name', 'web', 'tmpfs', 't0', 'destination'], value: '/tmp' },
      { op: 'set', path: ['container', 'name', 'web', 'tmpfs', 't0', 'size'], value: '64' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeTmpfsOp('web', 't0')).toEqual({
      op: 'delete',
      path: ['container', 'name', 'web', 'tmpfs', 't0'],
    })
  })
})

describe('network attachment ops', () => {
  it('always sets the network tag itself, even with no mac', () => {
    expect(addNetworkAttachmentOps('web', 'NET01', '')).toEqual([
      { op: 'set', path: ['container', 'name', 'web', 'network', 'NET01'] },
    ])
  })

  it('queues mac when given', () => {
    expect(addNetworkAttachmentOps('web', 'NET01', '00:11:22:33:44:55')).toEqual([
      { op: 'set', path: ['container', 'name', 'web', 'network', 'NET01'] },
      {
        op: 'set',
        path: ['container', 'name', 'web', 'network', 'NET01', 'mac'],
        value: '00:11:22:33:44:55',
      },
    ])
  })

  it('builds a remove op', () => {
    expect(removeNetworkAttachmentOp('web', 'NET01')).toEqual({
      op: 'delete',
      path: ['container', 'name', 'web', 'network', 'NET01'],
    })
  })
})

describe('health-check form', () => {
  it('queues nothing for a blank diff', () => {
    expect(healthCheckFormToOps('web', {}, blankHealthCheckFormValues())).toEqual([])
  })

  it('queues set ops for each changed field', () => {
    const values = blankHealthCheckFormValues()
    values.command = 'curl -f http://localhost/'
    values.interval = '30'

    expect(healthCheckFormToOps('web', {}, values)).toEqual([
      { op: 'set', path: ['container', 'name', 'web', 'health-check', 'command'], value: 'curl -f http://localhost/' },
      { op: 'set', path: ['container', 'name', 'web', 'health-check', 'interval'], value: '30' },
    ])
  })

  it('queues a delete when a field is cleared', () => {
    const before = { command: 'curl -f http://localhost/' }
    const values = healthCheckToFormValues(before)
    values.command = ''

    expect(healthCheckFormToOps('web', before, values)).toEqual([
      { op: 'delete', path: ['container', 'name', 'web', 'health-check', 'command'] },
    ])
  })
})
