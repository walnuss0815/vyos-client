import { beforeEach, describe, expect, it } from 'vitest'
import { usePendingChangesStore } from './pendingChanges'

beforeEach(() => {
  sessionStorage.clear()
  usePendingChangesStore.setState({ changes: [] })
})

describe('usePendingChangesStore', () => {
  it('starts empty', () => {
    expect(usePendingChangesStore.getState().changes).toHaveLength(0)
  })

  it('adds a change with a generated id', () => {
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].id).toBeTruthy()
    expect(changes[0].op.path).toEqual(['system', 'host-name'])
  })

  it('removes a change by id', () => {
    usePendingChangesStore.getState().add({ op: { op: 'set', path: ['a'], value: '1' }, label: 'a' })
    const id = usePendingChangesStore.getState().changes[0].id

    usePendingChangesStore.getState().remove(id)
    expect(usePendingChangesStore.getState().changes).toHaveLength(0)
  })

  it('clears all changes', () => {
    usePendingChangesStore.getState().add({ op: { op: 'set', path: ['a'], value: '1' }, label: 'a' })
    usePendingChangesStore.getState().add({ op: { op: 'set', path: ['b'], value: '2' }, label: 'b' })

    usePendingChangesStore.getState().clear()
    expect(usePendingChangesStore.getState().changes).toHaveLength(0)
  })

  it('persists to sessionStorage', () => {
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })

    const raw = sessionStorage.getItem('vyos-client-pending-changes')
    expect(raw).toBeTruthy()
    expect(raw).toContain('host-name')
  })

  // Regression test: pendingChanges previously persisted every op's
  // raw value verbatim, including real secrets (passwords, PSKs,
  // private keys) - anything a form ever queues ends up here before
  // commit, and this store's own doc comment already says
  // sessionStorage is the only place in-progress edits live.
  it('never writes a sensitive change value to sessionStorage, but keeps it in memory', () => {
    usePendingChangesStore.getState().add({
      op: { op: 'set', path: ['system', 'login', 'user', 'admin', 'authentication', 'plaintext-password'], value: 'super-secret-password' },
      label: 'set admin password',
    })

    // The in-memory store - what the review/diff panel and Commit
    // actually read within the same page load - still has the real
    // value; only what's written to sessionStorage is affected.
    expect(usePendingChangesStore.getState().changes).toHaveLength(1)
    expect(usePendingChangesStore.getState().changes[0].op.value).toBe('super-secret-password')

    const raw = sessionStorage.getItem('vyos-client-pending-changes')
    expect(raw).toBeTruthy()
    expect(raw).not.toContain('super-secret-password')
    // The change itself isn't just value-stripped-in-place (which
    // would produce a `set` op with the sensitive path but no value,
    // that could be misread as "clear this field" if ever rehydrated
    // and acted on) - it's dropped from persisted state entirely.
    expect(raw).not.toContain('plaintext-password')
  })

  it('still persists a non-sensitive change alongside a sensitive one', () => {
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })
    usePendingChangesStore.getState().add({
      op: { op: 'set', path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'x', 'authentication', 'pre-shared-secret'], value: 'my-psk' },
      label: 'set PSK',
    })

    const raw = sessionStorage.getItem('vyos-client-pending-changes')
    expect(raw).toContain('host-name')
    expect(raw).not.toContain('my-psk')
  })

  it('persists a sensitive-path delete op, which carries no secret value', () => {
    usePendingChangesStore.getState().add({
      op: { op: 'delete', path: ['system', 'login', 'user', 'admin', 'authentication', 'plaintext-password'] },
      label: 'delete admin password',
    })

    const raw = sessionStorage.getItem('vyos-client-pending-changes')
    expect(raw).toContain('plaintext-password')
  })
})
