import { describe, expect, it } from 'vitest'
import {
  blankContainerRegistryFormValues,
  containerRegistryFormToOps,
  containerRegistryToFormValues,
  deleteContainerRegistryOp,
} from './containerRegistryForm'
import { blankContainerRegistry, type ContainerRegistry } from './containerTypes'

function emptyRegistry(overrides: Partial<ContainerRegistry> = {}): ContainerRegistry {
  return { name: 'docker.io', ...blankContainerRegistry(), ...overrides }
}

describe('containerRegistryFormToOps - creating a new registry', () => {
  it('queues nothing for a blank form', () => {
    expect(containerRegistryFormToOps('docker.io', undefined, blankContainerRegistryFormValues())).toEqual([])
  })

  it('queues username and password', () => {
    const values = blankContainerRegistryFormValues()
    values.username = 'alice'
    values.password = 'secret123'

    expect(containerRegistryFormToOps('docker.io', undefined, values)).toEqual([
      { op: 'set', path: ['container', 'registry', 'docker.io', 'authentication', 'username'], value: 'alice' },
      {
        op: 'set',
        path: ['container', 'registry', 'docker.io', 'authentication', 'password'],
        value: 'secret123',
      },
    ])
  })

  it('queues disable/insecure flags', () => {
    const values = blankContainerRegistryFormValues()
    values.disabled = true
    values.insecure = true

    expect(containerRegistryFormToOps('docker.io', undefined, values)).toEqual([
      { op: 'set', path: ['container', 'registry', 'docker.io', 'disable'] },
      { op: 'set', path: ['container', 'registry', 'docker.io', 'insecure'] },
    ])
  })

  it('queues mirror fields', () => {
    const values = blankContainerRegistryFormValues()
    values.mirrorAddress = '192.0.2.10'
    values.mirrorHostName = 'mirror.example.com'
    values.mirrorPort = '5000'
    values.mirrorPath = '/v2'

    expect(containerRegistryFormToOps('docker.io', undefined, values)).toEqual([
      { op: 'set', path: ['container', 'registry', 'docker.io', 'mirror', 'address'], value: '192.0.2.10' },
      {
        op: 'set',
        path: ['container', 'registry', 'docker.io', 'mirror', 'host-name'],
        value: 'mirror.example.com',
      },
      { op: 'set', path: ['container', 'registry', 'docker.io', 'mirror', 'port'], value: '5000' },
      { op: 'set', path: ['container', 'registry', 'docker.io', 'mirror', 'path'], value: '/v2' },
    ])
  })
})

describe('containerRegistryFormToOps - editing an existing registry', () => {
  it('queues nothing when unchanged', () => {
    const registry = emptyRegistry({ username: 'alice' })
    expect(containerRegistryFormToOps('docker.io', registry, containerRegistryToFormValues(registry))).toEqual(
      [],
    )
  })

  it('always queues a fresh password when typed, regardless of hasPassword', () => {
    const registry = emptyRegistry({ hasPassword: true })
    const values = containerRegistryToFormValues(registry)
    values.password = 'new-secret'

    expect(containerRegistryFormToOps('docker.io', registry, values)).toEqual([
      {
        op: 'set',
        path: ['container', 'registry', 'docker.io', 'authentication', 'password'],
        value: 'new-secret',
      },
    ])
  })

  it('never queues anything for password when left blank', () => {
    const registry = emptyRegistry({ hasPassword: true })
    expect(containerRegistryFormToOps('docker.io', registry, containerRegistryToFormValues(registry))).toEqual(
      [],
    )
  })

  it('queues a delete when username is cleared', () => {
    const registry = emptyRegistry({ username: 'alice' })
    const values = containerRegistryToFormValues(registry)
    values.username = ''

    expect(containerRegistryFormToOps('docker.io', registry, values)).toEqual([
      { op: 'delete', path: ['container', 'registry', 'docker.io', 'authentication', 'username'] },
    ])
  })
})

describe('deleteContainerRegistryOp', () => {
  it('builds a delete op for the whole registry', () => {
    expect(deleteContainerRegistryOp('docker.io')).toEqual({
      op: 'delete',
      path: ['container', 'registry', 'docker.io'],
    })
  })
})
