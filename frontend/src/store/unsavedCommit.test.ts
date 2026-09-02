import { beforeEach, describe, expect, it } from 'vitest'
import type { PendingChange } from './pendingChanges'
import { useUnsavedCommitStore } from './unsavedCommit'

function change(overrides: Partial<PendingChange> = {}): PendingChange {
  return {
    id: 'c1',
    op: { op: 'set', path: ['system', 'host-name'], value: 'r1' },
    label: 'set host-name',
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  useUnsavedCommitStore.setState({ committedChanges: [] })
})

describe('useUnsavedCommitStore', () => {
  it('defaults to no committed changes', () => {
    expect(useUnsavedCommitStore.getState().committedChanges).toEqual([])
  })

  it('markCommitted appends the given changes', () => {
    useUnsavedCommitStore.getState().markCommitted([change()])
    expect(useUnsavedCommitStore.getState().committedChanges).toEqual([change()])
  })

  it('markCommitted accumulates across multiple commits', () => {
    useUnsavedCommitStore.getState().markCommitted([change({ id: 'c1' })])
    useUnsavedCommitStore.getState().markCommitted([change({ id: 'c2', label: 'second commit' })])

    const { committedChanges } = useUnsavedCommitStore.getState()
    expect(committedChanges).toHaveLength(2)
    expect(committedChanges.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('markSaved clears committedChanges', () => {
    useUnsavedCommitStore.getState().markCommitted([change()])
    useUnsavedCommitStore.getState().markSaved()
    expect(useUnsavedCommitStore.getState().committedChanges).toEqual([])
  })

  it('persists to localStorage, not sessionStorage', () => {
    useUnsavedCommitStore.getState().markCommitted([change()])

    const raw = localStorage.getItem('vyos-client-unsaved-commit')
    expect(raw).toBeTruthy()
    expect(raw).toContain('"host-name"')
    expect(sessionStorage.getItem('vyos-client-unsaved-commit')).toBeNull()
  })

  // Regression-style guard, mirroring usePendingChangesStore's own:
  // a committed change carrying a real secret value must never reach
  // localStorage, even though it already successfully committed.
  it('never persists a sensitive value to localStorage', () => {
    useUnsavedCommitStore.getState().markCommitted([
      change({
        op: {
          op: 'set',
          path: ['system', 'login', 'user', 'admin', 'authentication', 'plaintext-password'],
          value: 'hunter2-super-secret',
        },
      }),
    ])

    const raw = localStorage.getItem('vyos-client-unsaved-commit')
    expect(raw).not.toContain('hunter2-super-secret')
    // In-memory state is untouched - only what's WRITTEN to storage is filtered.
    expect(useUnsavedCommitStore.getState().committedChanges).toHaveLength(1)
  })
})
