import { describe, expect, it } from 'vitest'
import {
  blankContainerFormValues,
  containerFormToOps,
  containerToFormValues,
  deleteContainerOp,
} from './containerForm'
import { blankContainerDefinition, type ContainerDefinition } from './containerTypes'

function emptyContainer(overrides: Partial<ContainerDefinition> = {}): ContainerDefinition {
  return { name: 'web', ...blankContainerDefinition(), ...overrides }
}

describe('containerFormToOps - creating a new container', () => {
  // Regression test: without an unconditional base op, a new
  // container created with every field left blank (name only) queued
  // nothing at all - every field-diff against a blank form is a
  // no-op, so there was nothing to commit and the Commit button/
  // pending-changes bar never appeared.
  it('always sets the container itself, even with a blank form', () => {
    expect(containerFormToOps('web', undefined, blankContainerFormValues())).toEqual([
      { op: 'set', path: ['container', 'name', 'web'] },
    ])
  })

  it('queues image and scalar fields', () => {
    const values = blankContainerFormValues()
    values.image = 'nginx:latest'
    values.hostName = 'web-host'
    values.restart = 'always'

    const ops = containerFormToOps('web', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['container', 'name', 'web'] },
      { op: 'set', path: ['container', 'name', 'web', 'image'], value: 'nginx:latest' },
      { op: 'set', path: ['container', 'name', 'web', 'host-name'], value: 'web-host' },
      { op: 'set', path: ['container', 'name', 'web', 'restart'], value: 'always' },
    ])
  })

  it('queues boolean flags as valueless sets', () => {
    const values = blankContainerFormValues()
    values.disabled = true
    values.allowHostPid = true
    values.allowHostNetworks = true
    values.privileged = true

    const ops = containerFormToOps('web', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['container', 'name', 'web'] },
      { op: 'set', path: ['container', 'name', 'web', 'disable'] },
      { op: 'set', path: ['container', 'name', 'web', 'allow-host-pid'] },
      { op: 'set', path: ['container', 'name', 'web', 'allow-host-networks'] },
      { op: 'set', path: ['container', 'name', 'web', 'privileged'] },
    ])
  })

  it('queues one set op per added capability', () => {
    const values = blankContainerFormValues()
    values.capabilities = ['net-admin', 'sys-time']

    const ops = containerFormToOps('web', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['container', 'name', 'web'] },
        { op: 'set', path: ['container', 'name', 'web', 'capability'], value: 'net-admin' },
        { op: 'set', path: ['container', 'name', 'web', 'capability'], value: 'sys-time' },
      ]),
    )
    expect(ops).toHaveLength(3)
  })
})

describe('containerFormToOps - editing an existing container', () => {
  it('queues nothing when unchanged', () => {
    const container = emptyContainer({ image: 'nginx:latest' })
    expect(containerFormToOps('web', container, containerToFormValues(container))).toEqual([])
  })

  it('queues a delete when a scalar field is cleared', () => {
    const container = emptyContainer({ image: 'nginx:latest' })
    const values = containerToFormValues(container)
    values.image = ''

    expect(containerFormToOps('web', container, values)).toEqual([
      { op: 'delete', path: ['container', 'name', 'web', 'image'] },
    ])
  })

  it('queues a delete when a boolean flag is unchecked', () => {
    const container = emptyContainer({ privileged: true })
    const values = containerToFormValues(container)
    values.privileged = false

    expect(containerFormToOps('web', container, values)).toEqual([
      { op: 'delete', path: ['container', 'name', 'web', 'privileged'] },
    ])
  })

  it('diffs capabilities: adds new ones, removes dropped ones, leaves unchanged ones alone', () => {
    const container = emptyContainer({ capabilities: ['net-admin', 'chown'] })
    const values = containerToFormValues(container)
    values.capabilities = ['net-admin', 'sys-time']

    const ops = containerFormToOps('web', container, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['container', 'name', 'web', 'capability'], value: 'sys-time' },
        { op: 'delete', path: ['container', 'name', 'web', 'capability'], value: 'chown' },
      ]),
    )
    expect(ops).toHaveLength(2)
  })
})

describe('deleteContainerOp', () => {
  it('builds a delete op for the whole container', () => {
    expect(deleteContainerOp('web')).toEqual({ op: 'delete', path: ['container', 'name', 'web'] })
  })
})
