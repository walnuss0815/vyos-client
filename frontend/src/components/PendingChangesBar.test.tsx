import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/mocks/server'
import { createTestQueryClient, renderWithProviders } from '../test/testUtils'
import { usePendingChangesStore } from '../store/pendingChanges'
import PendingChangesBar from './PendingChangesBar'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

describe('PendingChangesBar', () => {
  it('renders nothing when there are no pending changes', () => {
    renderWithProviders(<PendingChangesBar />)
    expect(screen.queryByText(/pending change/i)).not.toBeInTheDocument()
  })

  it('shows the pending change count', () => {
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })

    renderWithProviders(<PendingChangesBar />)
    expect(screen.getByText(/1 pending change/i)).toBeInTheDocument()
  })

  it('clears changes on Discard', async () => {
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />)

    await user.click(screen.getByRole('button', { name: /discard/i }))
    expect(usePendingChangesStore.getState().changes).toHaveLength(0)
  })

  it('commits changes and clears the changeset on success', async () => {
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />)

    await user.click(screen.getByRole('button', { name: /^commit$/i }))

    await waitFor(() => {
      expect(usePendingChangesStore.getState().changes).toHaveLength(0)
    })
  })

  it('invalidates config-tree queries after a successful commit, so every page (Config Tree, Firewall, ...) refetches', async () => {
    const queryClient = createTestQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['firewall', 'zone', 'LAN', 'default-action'], value: 'drop' }, label: 'zone' })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />, { queryClient })

    await user.click(screen.getByRole('button', { name: /^commit$/i }))

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['config-tree'] })
    })
  })

  it('invalidates config-tree queries after confirming a commit-confirm', async () => {
    server.use(http.post('/api/config/commit', () => HttpResponse.json({ pendingConfirm: true })))
    const queryClient = createTestQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />, { queryClient })

    await user.click(screen.getByRole('button', { name: /^commit$/i }))
    await screen.findByText(/keep these changes/i)
    expect(invalidateSpy).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /keep changes/i }))

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['config-tree'] })
    })
  })

  it('shows the keep/revert confirm panel when commit-confirm is pending', async () => {
    server.use(
      http.post('/api/config/commit', () => HttpResponse.json({ pendingConfirm: true })),
    )
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />)

    await user.click(screen.getByRole('button', { name: /^commit$/i }))

    expect(await screen.findByText(/keep these changes/i)).toBeInTheDocument()
  })

  // Regression test: the discard button's aria-label used to be built
  // from PendingChange.label, which every call site constructs from
  // the RAW, unmasked value (e.g. `set ... plaintext-password 'hunter2'`).
  // The visible text correctly masks the value via maskValue(), but the
  // aria-label attribute did not, meaning a secret typed into a form
  // but never committed was readable in the DOM/accessibility tree via
  // "Inspect Element" or a screen reader, even though it looked masked
  // on screen. The aria-label (and the visible text) must both be
  // derived from op+maskValue(), never from the raw label string.
  it('does not leak the raw secret value via aria-label for sensitive fields', async () => {
    usePendingChangesStore.getState().add({
      op: {
        op: 'set',
        path: ['system', 'login', 'user', 'admin', 'authentication', 'plaintext-password'],
        value: 'hunter2-super-secret',
      },
      label: "set system login user admin authentication plaintext-password 'hunter2-super-secret'",
    })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />)

    await user.click(screen.getByText(/1 pending change/i))

    const discardRow = screen.getByRole('button', { name: /discard change:/i })
    expect(discardRow.getAttribute('aria-label')).not.toContain('hunter2-super-secret')
    expect(document.body.innerHTML).not.toContain('hunter2-super-secret')
  })

  // Regression test: clearing the confirmSeconds field entirely used
  // to silently produce Number('') === 0, which vyosApi.commit()
  // collapses to `undefined` (0 is falsy), sending no confirm_time at
  // all - i.e. commit-confirm protection silently disabled, with the
  // "Safe apply" checkbox still visibly checked. Given the whole point
  // of this feature is preventing lockout scenarios, that must be
  // impossible to do by accident: an invalid confirmSeconds value must
  // block committing, not silently degrade to "unsafe".
  it('disables committing when "Safe apply" is checked but confirmSeconds is cleared', async () => {
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />)

    const secondsInput = screen.getByRole('spinbutton')
    await user.clear(secondsInput)

    expect(screen.getByRole('button', { name: /^commit$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /commit & save/i })).toBeDisabled()
  })

  it('disables committing when confirmSeconds is out of the 10-600 range', async () => {
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />)

    const secondsInput = screen.getByRole('spinbutton')
    await user.clear(secondsInput)
    await user.type(secondsInput, '5')

    expect(screen.getByRole('button', { name: /^commit$/i })).toBeDisabled()
  })

  it('re-enables committing once confirmSeconds is a valid value again', async () => {
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />)

    const secondsInput = screen.getByRole('spinbutton')
    await user.clear(secondsInput)
    expect(screen.getByRole('button', { name: /^commit$/i })).toBeDisabled()

    await user.type(secondsInput, '120')
    expect(screen.getByRole('button', { name: /^commit$/i })).not.toBeDisabled()
  })

  it('does not block committing when "Safe apply" is unchecked, regardless of confirmSeconds', async () => {
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />)

    await user.click(screen.getByRole('checkbox', { name: /safe apply/i }))

    expect(screen.getByRole('button', { name: /^commit$/i })).not.toBeDisabled()
  })

  // Regression test: a failed Save after a successful (non-confirm)
  // commit used to fall into the same generic catch as a failed
  // commit, showing "Failed to apply changes." - misleading, since the
  // commit DID succeed and is already live; only persisting it to disk
  // failed. The pending-changes list must also stay cleared (the
  // commit really did apply), unlike a genuine commit failure.
  it('shows a distinct message when Save fails after Commit succeeds', async () => {
    server.use(http.post('/api/config/save', () => HttpResponse.json({ error: 'disk full' }, { status: 500 })))
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />)

    await user.click(screen.getByRole('checkbox', { name: /safe apply/i })) // disable safe apply -> no confirm step
    await user.click(screen.getByRole('button', { name: /commit & save/i }))

    expect(await screen.findByText(/applied but not saved/i)).toBeInTheDocument()
    expect(screen.getByText(/disk full/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(usePendingChangesStore.getState().changes).toHaveLength(0)
    })
  })

  // Regression test: "Commit & Save" with "Safe apply" checked (the
  // default state) used to silently drop the "& Save" part entirely -
  // handleKeep (the confirm-step handler) never called api.save(), so
  // clicking "Commit & Save" in the single most common configuration
  // (safe apply defaults to on) never actually saved anything.
  it('saves after confirming when "Commit & Save" was clicked with Safe apply on', async () => {
    server.use(http.post('/api/config/commit', () => HttpResponse.json({ pendingConfirm: true })))
    const saveSpy = vi.fn(() => new HttpResponse(null, { status: 204 }))
    server.use(http.post('/api/config/save', saveSpy))
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />)

    await user.click(screen.getByRole('button', { name: /commit & save/i }))
    await screen.findByText(/keep these changes/i)
    await user.click(screen.getByRole('button', { name: /keep changes/i }))

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalled()
    })
  })

  it('does not save after confirming when only "Commit" (not "Commit & Save") was clicked', async () => {
    server.use(http.post('/api/config/commit', () => HttpResponse.json({ pendingConfirm: true })))
    const saveSpy = vi.fn(() => new HttpResponse(null, { status: 204 }))
    server.use(http.post('/api/config/save', saveSpy))
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'set host-name' })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />)

    await user.click(screen.getByRole('button', { name: /^commit$/i }))
    await screen.findByText(/keep these changes/i)
    await user.click(screen.getByRole('button', { name: /keep changes/i }))

    await waitFor(() => {
      expect(usePendingChangesStore.getState().changes).toHaveLength(0)
    })
    expect(saveSpy).not.toHaveBeenCalled()
  })

  // Regression test: VyOS's own config value syntax has no escape
  // mechanism for an embedded single quote, so a value containing one
  // (e.g. a password with an apostrophe) used to sail straight through
  // to commit and fail with a confusing, VyOS-internals-flavored error
  // ("Cannot use the single quote (') character in a value string")
  // instead of being caught client-side with a clear explanation.
  it("disables committing when a pending change's value contains a single quote", async () => {
    usePendingChangesStore.getState().add({
      op: {
        op: 'set',
        path: ['system', 'login', 'user', 'alice', 'authentication', 'plaintext-password'],
        value: "it's-a-secret",
      },
      label: 'set password',
    })
    renderWithProviders(<PendingChangesBar />)

    expect(screen.getByRole('button', { name: /^commit$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /commit & save/i })).toBeDisabled()
    expect(screen.getByText(/can't contain/i)).toBeInTheDocument()
  })

  it('highlights the specific pending change containing a single quote', async () => {
    usePendingChangesStore.getState().add({
      op: { op: 'set', path: ['system', 'host-name'], value: "o'brien-router" },
      label: 'set host-name',
    })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />)

    await user.click(screen.getByRole('button', { name: /1 pending change/i }))

    expect(screen.getByText(/contains an unsupported single quote/i)).toBeInTheDocument()
  })

  // Regression test: a handful of form producers (bgpGlobalForm.ts's
  // addNetworkOp/addRedistributionOps, haVrrpForm.ts's
  // addVRRPGroupAddressOps) embed user-typed text directly into a
  // *path* segment - a tag-node value like `network <prefix>` or
  // `address <addr>` - rather than a scalar leaf's `value` field, so
  // the resulting op has no `value` at all for the offending text.
  // The value-only check above couldn't see a quote in that case.
  it("disables committing when a pending change's path (not value) contains a single quote", async () => {
    usePendingChangesStore.getState().add({
      op: {
        op: 'set',
        path: ['protocols', 'bgp', 'address-family', 'ipv4-unicast', 'network', "10.0.0.0/24'"],
      },
      label: 'add network',
    })
    renderWithProviders(<PendingChangesBar />)

    expect(screen.getByRole('button', { name: /^commit$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /commit & save/i })).toBeDisabled()
    expect(screen.getByText(/can't contain/i)).toBeInTheDocument()
  })

  it('does not block committing when no pending change contains a single quote', async () => {
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['system', 'host-name'], value: 'router1' }, label: 'set host-name' })
    renderWithProviders(<PendingChangesBar />)

    expect(screen.getByRole('button', { name: /^commit$/i })).not.toBeDisabled()
  })

  it('re-enables committing once the offending change is discarded', async () => {
    usePendingChangesStore.getState().add({
      op: { op: 'set', path: ['system', 'host-name'], value: "o'brien-router" },
      label: 'set host-name',
    })
    renderWithProviders(<PendingChangesBar />)
    expect(screen.getByRole('button', { name: /^commit$/i })).toBeDisabled()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /discard/i }))

    expect(usePendingChangesStore.getState().changes).toHaveLength(0)
  })

  it('shows an error message when commit fails', async () => {
    server.use(
      http.post('/api/config/commit', () =>
        HttpResponse.json({ error: 'Protocol must be defined if specifying a port' }, { status: 422 }),
      ),
    )
    usePendingChangesStore
      .getState()
      .add({ op: { op: 'set', path: ['firewall'], value: 'x' }, label: 'firewall' })
    const user = userEvent.setup()
    renderWithProviders(<PendingChangesBar />)

    await user.click(screen.getByRole('button', { name: /^commit$/i }))

    expect(await screen.findByText(/protocol must be defined/i)).toBeInTheDocument()
  })
})
