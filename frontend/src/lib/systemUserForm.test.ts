import { describe, expect, it } from 'vitest'
import {
  addPublicKeyOps,
  blankUserFormValues,
  deleteUserOp,
  removePublicKeyOp,
  userFormToOps,
  userToFormValues,
} from './systemUserForm'
import type { SystemUser } from './systemTypes'

function emptyUser(overrides: Partial<SystemUser> = {}): SystemUser {
  return { username: 'alice', disabled: false, hasPassword: false, publicKeys: [], ...overrides }
}

describe('userFormToOps - creating a new user', () => {
  it('queues nothing for a blank form', () => {
    expect(userFormToOps('alice', undefined, blankUserFormValues())).toEqual([])
  })

  it('queues full-name, disable, and password', () => {
    const values = blankUserFormValues()
    values.fullName = 'Alice Example'
    values.disabled = true
    values.password = 'secret123'

    const ops = userFormToOps('alice', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['system', 'login', 'user', 'alice', 'full-name'], value: 'Alice Example' },
      { op: 'set', path: ['system', 'login', 'user', 'alice', 'disable'] },
      {
        op: 'set',
        path: ['system', 'login', 'user', 'alice', 'authentication', 'plaintext-password'],
        value: 'secret123',
      },
    ])
  })
})

describe('userFormToOps - editing an existing user', () => {
  it('queues nothing when unchanged', () => {
    const user = emptyUser({ fullName: 'Alice' })
    expect(userFormToOps('alice', user, userToFormValues(user))).toEqual([])
  })

  it('always queues a fresh password when typed, regardless of hasPassword', () => {
    const user = emptyUser({ hasPassword: true })
    const values = userToFormValues(user)
    values.password = 'new-secret'

    const ops = userFormToOps('alice', user, values)

    expect(ops).toEqual([
      {
        op: 'set',
        path: ['system', 'login', 'user', 'alice', 'authentication', 'plaintext-password'],
        value: 'new-secret',
      },
    ])
  })

  it('never queues anything for password when left blank', () => {
    const user = emptyUser({ hasPassword: true })
    expect(userFormToOps('alice', user, userToFormValues(user))).toEqual([])
  })

  it('queues a delete when disabled is unchecked', () => {
    const user = emptyUser({ disabled: true })
    const values = userToFormValues(user)
    values.disabled = false

    expect(userFormToOps('alice', user, values)).toEqual([
      { op: 'delete', path: ['system', 'login', 'user', 'alice', 'disable'] },
    ])
  })
})

describe('deleteUserOp', () => {
  it('builds a delete op for the whole user', () => {
    expect(deleteUserOp('alice')).toEqual({ op: 'delete', path: ['system', 'login', 'user', 'alice'] })
  })
})

describe('public key ops', () => {
  it('queues key, type, and options', () => {
    const ops = addPublicKeyOps('alice', 'alice@laptop', 'AAAAB3...', 'ssh-ed25519', 'from="10.0.0.0/24"')
    expect(ops).toEqual([
      {
        op: 'set',
        path: [
          'system',
          'login',
          'user',
          'alice',
          'authentication',
          'public-keys',
          'alice@laptop',
          'key',
        ],
        value: 'AAAAB3...',
      },
      {
        op: 'set',
        path: [
          'system',
          'login',
          'user',
          'alice',
          'authentication',
          'public-keys',
          'alice@laptop',
          'type',
        ],
        value: 'ssh-ed25519',
      },
      {
        op: 'set',
        path: [
          'system',
          'login',
          'user',
          'alice',
          'authentication',
          'public-keys',
          'alice@laptop',
          'options',
        ],
        value: 'from="10.0.0.0/24"',
      },
    ])
  })

  it('omits type/options ops when blank', () => {
    const ops = addPublicKeyOps('alice', 'alice@laptop', 'AAAAB3...', '', '')
    expect(ops).toEqual([
      {
        op: 'set',
        path: [
          'system',
          'login',
          'user',
          'alice',
          'authentication',
          'public-keys',
          'alice@laptop',
          'key',
        ],
        value: 'AAAAB3...',
      },
    ])
  })

  it('builds a delete op for removing a key', () => {
    expect(removePublicKeyOp('alice', 'alice@laptop')).toEqual({
      op: 'delete',
      path: ['system', 'login', 'user', 'alice', 'authentication', 'public-keys', 'alice@laptop'],
    })
  })
})
