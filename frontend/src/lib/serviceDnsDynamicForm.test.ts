import { describe, expect, it } from 'vitest'
import {
  blankDynamicDNSEntryFormValues,
  blankDynamicDNSGlobalFormValues,
  deleteDynamicDNSEntryOp,
  dynamicDNSEntryFormToOps,
  dynamicDNSEntryToFormValues,
  dynamicDNSGlobalFormToOps,
  dynamicDNSGlobalToFormValues,
} from './serviceDnsDynamicForm'
import { blankDynamicDNSEntry, type DynamicDNSEntry } from './serviceDnsDynamicTypes'

function emptyEntry(overrides: Partial<DynamicDNSEntry> = {}): DynamicDNSEntry {
  return { name: 'home', ...blankDynamicDNSEntry(), ...overrides }
}

describe('dynamicDNSEntryFormToOps - creating a new entry', () => {
  it('queues nothing for a blank form', () => {
    expect(dynamicDNSEntryFormToOps('home', undefined, blankDynamicDNSEntryFormValues())).toEqual([])
  })

  it('queues scalar fields', () => {
    const values = blankDynamicDNSEntryFormValues()
    values.protocol = 'cloudflare'
    values.server = 'ns.example.com'

    expect(dynamicDNSEntryFormToOps('home', undefined, values)).toEqual([
      { op: 'set', path: ['service', 'dns', 'dynamic', 'name', 'home', 'protocol'], value: 'cloudflare' },
      { op: 'set', path: ['service', 'dns', 'dynamic', 'name', 'home', 'server'], value: 'ns.example.com' },
    ])
  })

  it('queues an interface-based address', () => {
    const values = blankDynamicDNSEntryFormValues()
    values.addressMode = 'interface'
    values.addressInterface = 'eth0'

    expect(dynamicDNSEntryFormToOps('home', undefined, values)).toEqual([
      { op: 'set', path: ['service', 'dns', 'dynamic', 'name', 'home', 'address', 'interface'], value: 'eth0' },
    ])
  })

  it('queues a web-based address', () => {
    const values = blankDynamicDNSEntryFormValues()
    values.addressMode = 'web'
    values.addressWebUrl = 'https://checkip.example.com'
    values.addressWebSkip = 'IP:'

    expect(dynamicDNSEntryFormToOps('home', undefined, values)).toEqual([
      {
        op: 'set',
        path: ['service', 'dns', 'dynamic', 'name', 'home', 'address', 'web', 'url'],
        value: 'https://checkip.example.com',
      },
      {
        op: 'set',
        path: ['service', 'dns', 'dynamic', 'name', 'home', 'address', 'web', 'skip'],
        value: 'IP:',
      },
    ])
  })

  it('queues a password when non-blank', () => {
    const values = blankDynamicDNSEntryFormValues()
    values.password = 'secret123'

    expect(dynamicDNSEntryFormToOps('home', undefined, values)).toEqual([
      { op: 'set', path: ['service', 'dns', 'dynamic', 'name', 'home', 'password'], value: 'secret123' },
    ])
  })
})

describe('dynamicDNSEntryFormToOps - editing an existing entry', () => {
  it('queues nothing when unchanged', () => {
    const entry = emptyEntry({ protocol: 'cloudflare' })
    expect(dynamicDNSEntryFormToOps('home', entry, dynamicDNSEntryToFormValues(entry))).toEqual([])
  })

  it('switches address mode from interface to web, deleting the old variant first', () => {
    const entry = emptyEntry({ addressMode: 'interface', addressInterface: 'eth0' })
    const values = dynamicDNSEntryToFormValues(entry)
    values.addressMode = 'web'
    values.addressWebUrl = 'https://checkip.example.com'

    expect(dynamicDNSEntryFormToOps('home', entry, values)).toEqual([
      { op: 'delete', path: ['service', 'dns', 'dynamic', 'name', 'home', 'address'] },
      {
        op: 'set',
        path: ['service', 'dns', 'dynamic', 'name', 'home', 'address', 'web', 'url'],
        value: 'https://checkip.example.com',
      },
    ])
  })

  it('never queues anything for password when left blank', () => {
    const entry = emptyEntry({ hasPassword: true })
    expect(dynamicDNSEntryFormToOps('home', entry, dynamicDNSEntryToFormValues(entry))).toEqual([])
  })

  it('always queues a fresh password when typed, regardless of hasPassword', () => {
    const entry = emptyEntry({ hasPassword: true })
    const values = dynamicDNSEntryToFormValues(entry)
    values.password = 'new-secret'

    expect(dynamicDNSEntryFormToOps('home', entry, values)).toEqual([
      { op: 'set', path: ['service', 'dns', 'dynamic', 'name', 'home', 'password'], value: 'new-secret' },
    ])
  })
})

describe('deleteDynamicDNSEntryOp', () => {
  it('builds a delete op for the whole entry', () => {
    expect(deleteDynamicDNSEntryOp('home')).toEqual({
      op: 'delete',
      path: ['service', 'dns', 'dynamic', 'name', 'home'],
    })
  })
})

describe('dynamicDNSGlobalFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(dynamicDNSGlobalFormToOps({}, blankDynamicDNSGlobalFormValues())).toEqual([])
  })

  it('queues interval and vrf', () => {
    const values = blankDynamicDNSGlobalFormValues()
    values.interval = '600'
    values.vrf = 'RED'

    expect(dynamicDNSGlobalFormToOps({}, values)).toEqual([
      { op: 'set', path: ['service', 'dns', 'dynamic', 'interval'], value: '600' },
      { op: 'set', path: ['service', 'dns', 'dynamic', 'vrf'], value: 'RED' },
    ])
  })

  it('queues a delete when cleared', () => {
    const before = { interval: '600' }
    const values = dynamicDNSGlobalToFormValues(before)
    values.interval = ''

    expect(dynamicDNSGlobalFormToOps(before, values)).toEqual([
      { op: 'delete', path: ['service', 'dns', 'dynamic', 'interval'] },
    ])
  })
})
