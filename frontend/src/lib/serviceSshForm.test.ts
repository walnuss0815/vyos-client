import { describe, expect, it } from 'vitest'
import {
  blankSSHFormValues,
  disableSSHOp,
  enableSSHOp,
  sshConfigToFormValues,
  sshFormToOps,
} from './serviceSshForm'
import { blankSSHConfig } from './serviceSshTypes'

describe('sshFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(sshFormToOps(blankSSHConfig(), blankSSHFormValues())).toEqual([])
  })

  it('queues flag fields as valueless sets', () => {
    const values = blankSSHFormValues()
    values.disablePasswordAuthentication = true
    values.fidoPinRequired = true

    expect(sshFormToOps(blankSSHConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'ssh', 'disable-password-authentication'] },
      { op: 'set', path: ['service', 'ssh', 'fido', 'pin-required'] },
    ])
  })

  it('queues scalar fields', () => {
    const values = blankSSHFormValues()
    values.loglevel = 'verbose'
    values.dynamicProtectionThreshold = '10'

    expect(sshFormToOps(blankSSHConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'ssh', 'dynamic-protection', 'threshold'], value: '10' },
      { op: 'set', path: ['service', 'ssh', 'loglevel'], value: 'verbose' },
    ])
  })

  it('queues a delete when a field is cleared', () => {
    const before = { ...blankSSHConfig(), loglevel: 'verbose' }
    const values = sshConfigToFormValues(before)
    values.loglevel = ''

    expect(sshFormToOps(before, values)).toEqual([
      { op: 'delete', path: ['service', 'ssh', 'loglevel'] },
    ])
  })
})

describe('enableSSHOp / disableSSHOp', () => {
  it('enables by setting the bare service node', () => {
    expect(enableSSHOp()).toEqual({ op: 'set', path: ['service', 'ssh'] })
  })

  it('disables by deleting the whole service node', () => {
    expect(disableSSHOp()).toEqual({ op: 'delete', path: ['service', 'ssh'] })
  })
})
