import { describe, expect, it } from 'vitest'
import { blankPeerFormValues, peerFormToOps, peerToFormValues } from './bgpPeerForm'
import type { BGPPeer } from './bgpTypes'

function emptyPeer(overrides: Partial<BGPPeer> = {}): BGPPeer {
  return {
    identifier: '192.0.2.2',
    kind: 'neighbor',
    hasPassword: false,
    shutdown: false,
    passive: false,
    ipv4Unicast: {
      nexthopSelf: false,
      removePrivateAs: false,
      softReconfigurationInbound: false,
    },
    ipv6Unicast: {
      nexthopSelf: false,
      removePrivateAs: false,
      softReconfigurationInbound: false,
    },
    ...overrides,
  }
}

describe('peerFormToOps - creating a new neighbor (before = undefined)', () => {
  it('queues only the fields the user actually filled in', () => {
    const values = blankPeerFormValues()
    values.remoteAs = '64513'
    values.description = 'Upstream'

    const ops = peerFormToOps('neighbor', '192.0.2.2', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'remote-as'], value: '64513' },
        {
          op: 'set',
          path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'description'],
          value: 'Upstream',
        },
      ]),
    )
    expect(ops).toHaveLength(2)
  })

  it('queues a flag set for shutdown/passive when checked', () => {
    const values = blankPeerFormValues()
    values.remoteAs = '64513'
    values.shutdown = true
    values.passive = true

    const ops = peerFormToOps('neighbor', '192.0.2.2', undefined, values)

    expect(ops).toContainEqual({
      op: 'set',
      path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'shutdown'],
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'passive'],
    })
  })

  it('queues address-family settings under the right family', () => {
    const values = blankPeerFormValues()
    values.remoteAs = '64513'
    values.ipv4Unicast.nexthopSelf = true
    values.ipv4Unicast.maximumPrefix = '1000'
    values.ipv6Unicast.removePrivateAs = true

    const ops = peerFormToOps('neighbor', '192.0.2.2', undefined, values)

    expect(ops).toContainEqual({
      op: 'set',
      path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'address-family', 'ipv4-unicast', 'nexthop-self'],
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: [
        'protocols',
        'bgp',
        'neighbor',
        '192.0.2.2',
        'address-family',
        'ipv4-unicast',
        'maximum-prefix',
      ],
      value: '1000',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: [
        'protocols',
        'bgp',
        'neighbor',
        '192.0.2.2',
        'address-family',
        'ipv6-unicast',
        'remove-private-as',
      ],
    })
  })

  it('queues the nested soft-reconfiguration inbound flag correctly', () => {
    const values = blankPeerFormValues()
    values.remoteAs = '64513'
    values.ipv4Unicast.softReconfigurationInbound = true

    const ops = peerFormToOps('neighbor', '192.0.2.2', undefined, values)

    expect(ops).toContainEqual({
      op: 'set',
      path: [
        'protocols',
        'bgp',
        'neighbor',
        '192.0.2.2',
        'address-family',
        'ipv4-unicast',
        'soft-reconfiguration',
        'inbound',
      ],
    })
  })

  it('builds a peer-group path when kind is peer-group', () => {
    const values = blankPeerFormValues()
    values.remoteAs = 'external'

    const ops = peerFormToOps('peer-group', 'UPSTREAM', undefined, values)

    expect(ops).toContainEqual({
      op: 'set',
      path: ['protocols', 'bgp', 'peer-group', 'UPSTREAM', 'remote-as'],
      value: 'external',
    })
  })

  it('queues nothing at all for a completely blank form', () => {
    expect(peerFormToOps('neighbor', '192.0.2.2', undefined, blankPeerFormValues())).toEqual([])
  })
})

describe('peerFormToOps - editing an existing peer', () => {
  it('queues nothing when the form is unchanged', () => {
    const peer = emptyPeer({ remoteAs: '64513', description: 'Upstream' })
    const ops = peerFormToOps('neighbor', '192.0.2.2', peer, peerToFormValues(peer))
    expect(ops).toEqual([])
  })

  it('queues only the changed field', () => {
    const peer = emptyPeer({ remoteAs: '64513' })
    const values = peerToFormValues(peer)
    values.remoteAs = '64514'

    const ops = peerFormToOps('neighbor', '192.0.2.2', peer, values)

    expect(ops).toEqual([
      { op: 'set', path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'remote-as'], value: '64514' },
    ])
  })

  it('queues a delete when a previously-set field is cleared', () => {
    const peer = emptyPeer({ description: 'old description' })
    const values = peerToFormValues(peer)
    values.description = ''

    const ops = peerFormToOps('neighbor', '192.0.2.2', peer, values)

    expect(ops).toEqual([
      { op: 'delete', path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'description'] },
    ])
  })

  it('queues a flag delete when shutdown is unchecked', () => {
    const peer = emptyPeer({ shutdown: true })
    const values = peerToFormValues(peer)
    values.shutdown = false

    const ops = peerFormToOps('neighbor', '192.0.2.2', peer, values)

    expect(ops).toEqual([
      { op: 'delete', path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'shutdown'] },
    ])
  })
})

describe('peerFormToOps - password handling', () => {
  it('always queues a set when a new password is typed, regardless of hasPassword', () => {
    const peer = emptyPeer({ hasPassword: true })
    const values = peerToFormValues(peer)
    values.password = 'new-secret'

    const ops = peerFormToOps('neighbor', '192.0.2.2', peer, values)

    expect(ops).toEqual([
      {
        op: 'set',
        path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'password'],
        value: 'new-secret',
      },
    ])
  })

  it('never queues anything for password when left blank, even if one is already configured', () => {
    const peer = emptyPeer({ hasPassword: true })
    const ops = peerFormToOps('neighbor', '192.0.2.2', peer, peerToFormValues(peer))
    expect(ops.some((o) => o.path.includes('password'))).toBe(false)
  })
})

describe('peerToFormValues', () => {
  it('normalizes undefined fields to empty strings/false, and password always blank', () => {
    const peer = emptyPeer({ hasPassword: true })
    const values = peerToFormValues(peer)
    expect(values.remoteAs).toBe('')
    expect(values.description).toBe('')
    expect(values.password).toBe('')
    expect(values.shutdown).toBe(false)
    expect(values.ipv4Unicast).toEqual({
      nexthopSelf: false,
      removePrivateAs: false,
      softReconfigurationInbound: false,
      maximumPrefix: '',
    })
  })
})
