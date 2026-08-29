import { describe, expect, it } from 'vitest'
import {
  addTFTPListenAddressOps,
  blankTFTPServerFormValues,
  disableTFTPServerOp,
  enableTFTPServerOp,
  removeTFTPListenAddressOp,
  tftpConfigToFormValues,
  tftpServerFormToOps,
} from './serviceTftpForm'
import { blankTFTPServerConfig } from './serviceTftpTypes'

describe('tftpServerFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(tftpServerFormToOps(blankTFTPServerConfig(), blankTFTPServerFormValues())).toEqual([])
  })

  it('queues directory, allow-upload, and port', () => {
    const values = blankTFTPServerFormValues()
    values.directory = '/srv/tftp'
    values.allowUpload = true
    values.port = '6969'

    expect(tftpServerFormToOps(blankTFTPServerConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'tftp-server', 'directory'], value: '/srv/tftp' },
      { op: 'set', path: ['service', 'tftp-server', 'allow-upload'] },
      { op: 'set', path: ['service', 'tftp-server', 'port'], value: '6969' },
    ])
  })

  it('queues a delete when cleared', () => {
    const before = { ...blankTFTPServerConfig(), directory: '/srv/tftp' }
    const values = tftpConfigToFormValues(before)
    values.directory = ''

    expect(tftpServerFormToOps(before, values)).toEqual([
      { op: 'delete', path: ['service', 'tftp-server', 'directory'] },
    ])
  })
})

describe('enableTFTPServerOp / disableTFTPServerOp', () => {
  it('builds the expected ops', () => {
    expect(enableTFTPServerOp()).toEqual({ op: 'set', path: ['service', 'tftp-server'] })
    expect(disableTFTPServerOp()).toEqual({ op: 'delete', path: ['service', 'tftp-server'] })
  })
})

describe('listen-address ops', () => {
  it('always sets the tag, plus vrf when given', () => {
    expect(addTFTPListenAddressOps('192.0.2.1', 'RED')).toEqual([
      { op: 'set', path: ['service', 'tftp-server', 'listen-address', '192.0.2.1'] },
      { op: 'set', path: ['service', 'tftp-server', 'listen-address', '192.0.2.1', 'vrf'], value: 'RED' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeTFTPListenAddressOp('192.0.2.1')).toEqual({
      op: 'delete',
      path: ['service', 'tftp-server', 'listen-address', '192.0.2.1'],
    })
  })
})
