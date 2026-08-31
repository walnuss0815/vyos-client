import { beforeEach, describe, expect, it } from 'vitest'
import { hasPendingDelete, hasPendingSet, usePendingChangesStore, withPendingEnable } from './pendingChanges'

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

// Regression coverage for the "Enable X requires a commit before it's
// configurable" bug: useServiceConfig.ts/useVpnConfig.ts derive each
// feature's `enabled` flag by OR-ing hasPendingSet(...) into the
// fetched-config check, and AND-ing out hasPendingDelete(...) for the
// symmetric "Disable X entirely" case.
describe('hasPendingSet', () => {
  it('is false when there are no changes', () => {
    expect(hasPendingSet([], ['service', 'ssh'])).toBe(false)
  })

  it('is true when a set op exactly matches the path', () => {
    usePendingChangesStore.getState().add({ op: { op: 'set', path: ['service', 'ssh'] }, label: 'set service ssh' })
    expect(hasPendingSet(usePendingChangesStore.getState().changes, ['service', 'ssh'])).toBe(true)
  })

  it('is false for a delete op on the same path', () => {
    usePendingChangesStore.getState().add({ op: { op: 'delete', path: ['service', 'ssh'] }, label: 'delete service ssh' })
    expect(hasPendingSet(usePendingChangesStore.getState().changes, ['service', 'ssh'])).toBe(false)
  })

  it('is false for a set op on a different (even related/nested) path', () => {
    usePendingChangesStore.getState().add({
      op: { op: 'set', path: ['service', 'ssh', 'port'], value: '2222' },
      label: 'set service ssh port',
    })
    expect(hasPendingSet(usePendingChangesStore.getState().changes, ['service', 'ssh'])).toBe(false)
  })

  // Regression test: hasPendingSet/hasPendingDelete used to check
  // "does ANY matching op exist" rather than "what's the MOST RECENT
  // matching op" - so once a delete was ever queued for a path, it
  // permanently masked a later re-enabling set for that same path,
  // and a gated feature (e.g. mDNS repeater) could never be shown as
  // enabled again in the same session without first committing.
  it('is true when the LATEST matching op is a set, even if an earlier delete exists for the same path', () => {
    usePendingChangesStore.getState().add({ op: { op: 'set', path: ['service', 'ssh'] }, label: 'set service ssh' })
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'delete', path: ['service', 'ssh'] }, label: 'delete service ssh' })
    usePendingChangesStore.getState().add({ op: { op: 'set', path: ['service', 'ssh'] }, label: 'set service ssh' })
    expect(hasPendingSet(usePendingChangesStore.getState().changes, ['service', 'ssh'])).toBe(true)
  })
})

describe('hasPendingDelete', () => {
  it('is false when there are no changes', () => {
    expect(hasPendingDelete([], ['service', 'ssh'])).toBe(false)
  })

  it('is true when a delete op exactly matches the path', () => {
    usePendingChangesStore.getState().add({ op: { op: 'delete', path: ['service', 'ssh'] }, label: 'delete service ssh' })
    expect(hasPendingDelete(usePendingChangesStore.getState().changes, ['service', 'ssh'])).toBe(true)
  })

  it('is false for a set op on the same path', () => {
    usePendingChangesStore.getState().add({ op: { op: 'set', path: ['service', 'ssh'] }, label: 'set service ssh' })
    expect(hasPendingDelete(usePendingChangesStore.getState().changes, ['service', 'ssh'])).toBe(false)
  })

  // Regression test: the mirror of hasPendingSet's - an earlier set
  // must not mask a later delete for the same path either.
  it('is true when the LATEST matching op is a delete, even if an earlier set exists for the same path', () => {
    usePendingChangesStore.getState().add({ op: { op: 'set', path: ['service', 'ssh'] }, label: 'set service ssh' })
    usePendingChangesStore.getState().add({ op: { op: 'delete', path: ['service', 'ssh'] }, label: 'delete service ssh' })
    expect(hasPendingDelete(usePendingChangesStore.getState().changes, ['service', 'ssh'])).toBe(true)
  })
})

describe('withPendingEnable', () => {
  const path = ['service', 'ssh']

  it('leaves an already-enabled config alone when there are no changes', () => {
    const parsed = { enabled: true, port: '22' }
    expect(withPendingEnable(parsed, path, [])).toEqual(parsed)
  })

  it('leaves a disabled config alone when there are no changes', () => {
    const parsed = { enabled: false }
    expect(withPendingEnable(parsed, path, [])).toEqual({ enabled: false })
  })

  it('flips a disabled config to enabled when a pending set matches the path', () => {
    usePendingChangesStore.getState().add({ op: { op: 'set', path }, label: 'set service ssh' })
    const parsed = { enabled: false }
    expect(withPendingEnable(parsed, path, usePendingChangesStore.getState().changes)).toEqual({ enabled: true })
  })

  it('does not flip an already-enabled config just because of an unrelated pending set', () => {
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['service', 'ssh', 'port'], value: '2222' }, label: 'set service ssh port' })
    const parsed = { enabled: true, port: '22' }
    expect(withPendingEnable(parsed, path, usePendingChangesStore.getState().changes)).toEqual(parsed)
  })

  it('flips an enabled config to disabled when a pending delete matches the path', () => {
    usePendingChangesStore.getState().add({ op: { op: 'delete', path }, label: 'delete service ssh' })
    const parsed = { enabled: true, port: '22' }
    expect(withPendingEnable(parsed, path, usePendingChangesStore.getState().changes)).toEqual({
      enabled: false,
      port: '22',
    })
  })

  it('whichever of set/delete was queued LAST wins, not delete unconditionally', () => {
    usePendingChangesStore.getState().add({ op: { op: 'set', path }, label: 'set service ssh' })
    usePendingChangesStore.getState().add({ op: { op: 'delete', path }, label: 'delete service ssh' })
    const parsed = { enabled: false }
    expect(withPendingEnable(parsed, path, usePendingChangesStore.getState().changes)).toEqual({ enabled: false })
  })

  // Regression test for the exact reported bug: enable, then disable,
  // then enable again (all before committing) must end up enabled -
  // the stale earlier delete must not permanently block re-enabling.
  it('re-enables correctly after an enable -> disable -> enable cycle, all uncommitted', () => {
    usePendingChangesStore.getState().add({ op: { op: 'set', path }, label: 'set service ssh' })
    usePendingChangesStore.getState().add({ op: { op: 'delete', path }, label: 'delete service ssh' })
    usePendingChangesStore.getState().add({ op: { op: 'set', path }, label: 'set service ssh' })
    const parsed = { enabled: false }
    expect(withPendingEnable(parsed, path, usePendingChangesStore.getState().changes)).toEqual({ enabled: true })
  })

  // And the mirror: disable -> enable -> disable again must end up
  // disabled.
  it('re-disables correctly after a disable -> enable -> disable cycle, all uncommitted', () => {
    usePendingChangesStore.getState().add({ op: { op: 'delete', path }, label: 'delete service ssh' })
    usePendingChangesStore.getState().add({ op: { op: 'set', path }, label: 'set service ssh' })
    usePendingChangesStore.getState().add({ op: { op: 'delete', path }, label: 'delete service ssh' })
    const parsed = { enabled: true, port: '22' }
    expect(withPendingEnable(parsed, path, usePendingChangesStore.getState().changes)).toEqual({
      enabled: false,
      port: '22',
    })
  })
})
