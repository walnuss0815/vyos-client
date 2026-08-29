import { describe, expect, it } from 'vitest'
import {
  blankInterfaceFormValues,
  deleteInterfaceOp,
  interfaceFormToOps,
  interfaceToFormValues,
} from './ospfInterfaceForm'
import type { OSPFInterface } from './ospfTypes'

function emptyInterface(overrides: Partial<OSPFInterface> = {}): OSPFInterface {
  return {
    name: 'eth0',
    passive: false,
    mtuIgnore: false,
    bfd: false,
    hasPlaintextPassword: false,
    hasMd5Key: false,
    ...overrides,
  }
}

describe('interfaceFormToOps - creating a new interface', () => {
  it('queues nothing for a blank form', () => {
    expect(interfaceFormToOps('ospf', 'eth0', undefined, blankInterfaceFormValues())).toEqual([])
  })

  it('queues scalar and flag fields', () => {
    const values = blankInterfaceFormValues()
    values.area = '0'
    values.cost = '10'
    values.passive = true

    const ops = interfaceFormToOps('ospf', 'eth0', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['protocols', 'ospf', 'interface', 'eth0', 'area'], value: '0' },
        { op: 'set', path: ['protocols', 'ospf', 'interface', 'eth0', 'cost'], value: '10' },
        { op: 'set', path: ['protocols', 'ospf', 'interface', 'eth0', 'passive'] },
      ]),
    )
    expect(ops).toHaveLength(3)
  })

  it('builds an ospfv3 path and never queues authentication ops', () => {
    const values = blankInterfaceFormValues()
    values.area = '0'
    values.authMode = 'plaintext-password'
    values.plaintextPassword = 'secret'

    const ops = interfaceFormToOps('ospfv3', 'eth0', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['protocols', 'ospfv3', 'interface', 'eth0', 'area'], value: '0' },
    ])
  })

  it('sets plaintext-password authentication', () => {
    const values = blankInterfaceFormValues()
    values.authMode = 'plaintext-password'
    values.plaintextPassword = 'secret'

    const ops = interfaceFormToOps('ospf', 'eth0', undefined, values)

    expect(ops).toEqual([
      {
        op: 'set',
        path: ['protocols', 'ospf', 'interface', 'eth0', 'authentication', 'plaintext-password'],
        value: 'secret',
      },
    ])
  })

  it('sets md5 authentication with a key-id and key', () => {
    const values = blankInterfaceFormValues()
    values.authMode = 'md5'
    values.md5KeyId = '1'
    values.md5Key = 'secret'

    const ops = interfaceFormToOps('ospf', 'eth0', undefined, values)

    expect(ops).toEqual([
      {
        op: 'set',
        path: ['protocols', 'ospf', 'interface', 'eth0', 'authentication', 'md5', 'key-id', '1'],
      },
      {
        op: 'set',
        path: [
          'protocols',
          'ospf',
          'interface',
          'eth0',
          'authentication',
          'md5',
          'key-id',
          '1',
          'md5-key',
        ],
        value: 'secret',
      },
    ])
  })

  it('sets null authentication as a bare flag', () => {
    const values = blankInterfaceFormValues()
    values.authMode = 'null'

    const ops = interfaceFormToOps('ospf', 'eth0', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'interface', 'eth0', 'authentication', 'null'] },
    ])
  })

  it('does not set md5 key-id if no key-id was entered', () => {
    const values = blankInterfaceFormValues()
    values.authMode = 'md5'
    values.md5Key = 'secret'

    expect(interfaceFormToOps('ospf', 'eth0', undefined, values)).toEqual([])
  })
})

describe('interfaceFormToOps - editing an existing interface', () => {
  it('queues nothing when unchanged', () => {
    const iface = emptyInterface({ area: '0', cost: '10' })
    const ops = interfaceFormToOps('ospf', 'eth0', iface, interfaceToFormValues(iface))
    expect(ops).toEqual([])
  })

  it('diffs a single scalar field', () => {
    const iface = emptyInterface({ cost: '10' })
    const values = interfaceToFormValues(iface)
    values.cost = '20'

    const ops = interfaceFormToOps('ospf', 'eth0', iface, values)

    expect(ops).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'interface', 'eth0', 'cost'], value: '20' },
    ])
  })

  it('queues a delete when a flag is unchecked', () => {
    const iface = emptyInterface({ bfd: true })
    const values = interfaceToFormValues(iface)
    values.bfd = false

    const ops = interfaceFormToOps('ospf', 'eth0', iface, values)

    expect(ops).toEqual([{ op: 'delete', path: ['protocols', 'ospf', 'interface', 'eth0', 'bfd'] }])
  })

  it('always queues a fresh plaintext-password when typed, regardless of hasPlaintextPassword', () => {
    const iface = emptyInterface({ authMode: 'plaintext-password', hasPlaintextPassword: true })
    const values = interfaceToFormValues(iface)
    values.plaintextPassword = 'new-secret'

    const ops = interfaceFormToOps('ospf', 'eth0', iface, values)

    expect(ops).toEqual([
      {
        op: 'set',
        path: ['protocols', 'ospf', 'interface', 'eth0', 'authentication', 'plaintext-password'],
        value: 'new-secret',
      },
    ])
  })

  it('queues nothing for auth when the password field is left blank', () => {
    const iface = emptyInterface({ authMode: 'plaintext-password', hasPlaintextPassword: true })
    const ops = interfaceFormToOps('ospf', 'eth0', iface, interfaceToFormValues(iface))
    expect(ops).toEqual([])
  })

  it('rebuilds authentication when switching from plaintext-password to md5', () => {
    const iface = emptyInterface({ authMode: 'plaintext-password', hasPlaintextPassword: true })
    const values = interfaceToFormValues(iface)
    values.authMode = 'md5'
    values.md5KeyId = '1'
    values.md5Key = 'secret'

    const ops = interfaceFormToOps('ospf', 'eth0', iface, values)

    expect(ops).toEqual([
      { op: 'delete', path: ['protocols', 'ospf', 'interface', 'eth0', 'authentication'] },
      {
        op: 'set',
        path: ['protocols', 'ospf', 'interface', 'eth0', 'authentication', 'md5', 'key-id', '1'],
      },
      {
        op: 'set',
        path: [
          'protocols',
          'ospf',
          'interface',
          'eth0',
          'authentication',
          'md5',
          'key-id',
          '1',
          'md5-key',
        ],
        value: 'secret',
      },
    ])
  })

  it('rebuilds authentication when the md5 key-id changes, even if the key itself is untyped', () => {
    const iface = emptyInterface({ authMode: 'md5', md5KeyId: '1', hasMd5Key: true })
    const values = interfaceToFormValues(iface)
    values.md5KeyId = '2'

    const ops = interfaceFormToOps('ospf', 'eth0', iface, values)

    expect(ops).toEqual([
      { op: 'delete', path: ['protocols', 'ospf', 'interface', 'eth0', 'authentication'] },
      {
        op: 'set',
        path: ['protocols', 'ospf', 'interface', 'eth0', 'authentication', 'md5', 'key-id', '2'],
      },
    ])
  })

  it('queues just a fresh md5-key when the key-id stays the same', () => {
    const iface = emptyInterface({ authMode: 'md5', md5KeyId: '1', hasMd5Key: true })
    const values = interfaceToFormValues(iface)
    values.md5Key = 'rotated-secret'

    const ops = interfaceFormToOps('ospf', 'eth0', iface, values)

    expect(ops).toEqual([
      {
        op: 'set',
        path: [
          'protocols',
          'ospf',
          'interface',
          'eth0',
          'authentication',
          'md5',
          'key-id',
          '1',
          'md5-key',
        ],
        value: 'rotated-secret',
      },
    ])
  })

  it('clears authentication entirely when switching back to none', () => {
    const iface = emptyInterface({ authMode: 'null' })
    const values = interfaceToFormValues(iface)
    values.authMode = ''

    const ops = interfaceFormToOps('ospf', 'eth0', iface, values)

    expect(ops).toEqual([
      { op: 'delete', path: ['protocols', 'ospf', 'interface', 'eth0', 'authentication'] },
    ])
  })
})

describe('deleteInterfaceOp', () => {
  it('builds a delete op for the whole interface', () => {
    expect(deleteInterfaceOp('ospfv3', 'eth0')).toEqual({
      op: 'delete',
      path: ['protocols', 'ospfv3', 'interface', 'eth0'],
    })
  })
})
