import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/mocks/server'
import { createTestQueryClient, renderWithProviders } from '../test/testUtils'
import { usePendingChangesStore } from '../store/pendingChanges'
import { useUnsavedCommitStore } from '../store/unsavedCommit'
import ImportConfigPanel from './ImportConfigPanel'

function makeFile(content: string, name = 'config.txt') {
  return new File([content], name, { type: 'text/plain' })
}

beforeEach(() => {
  localStorage.clear()
  usePendingChangesStore.setState({ changes: [] })
  useUnsavedCommitStore.setState({ committedChanges: [] })
  server.use(http.post('/api/config/import', () => HttpResponse.json({ pendingConfirm: false })))
})

describe('ImportConfigPanel', () => {
  it('disables the import button until a file is chosen', () => {
    renderWithProviders(<ImportConfigPanel />)
    expect(screen.getByRole('button', { name: /import configuration/i })).toBeDisabled()
  })

  it('imports a merge by default once a file is chosen', async () => {
    const user = userEvent.setup()
    let receivedBody: unknown
    server.use(
      http.post('/api/config/import', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ pendingConfirm: false })
      }),
    )
    renderWithProviders(<ImportConfigPanel />)

    const input = screen.getByLabelText(/configuration file/i)
    await user.upload(input, makeFile("set system host-name 'r1'\n"))

    const importButton = screen.getByRole('button', { name: /import configuration/i })
    await waitFor(() => expect(importButton).not.toBeDisabled())
    await user.click(importButton)

    expect(await screen.findByText(/imported successfully/i)).toBeInTheDocument()
    expect(receivedBody).toMatchObject({ mode: 'merge', content: "set system host-name 'r1'\n" })
  })

  it('invalidates every config-derived query after an import', async () => {
    const queryClient = createTestQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const user = userEvent.setup()
    renderWithProviders(<ImportConfigPanel />, { queryClient })

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile("set system host-name 'r1'\n"))
    const importButton = screen.getByRole('button', { name: /import configuration/i })
    await waitFor(() => expect(importButton).not.toBeDisabled())
    await user.click(importButton)
    await screen.findByText(/imported successfully/i)

    for (const queryKey of [['config-tree'], ['set-commands'], ['system-info'], ['pki-expiry']]) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey })
    }
  })

  it('warns in load mode that queued changes were made against the current configuration', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportConfigPanel />)
    await user.click(screen.getByRole('radio', { name: /full replace/i }))
    expect(screen.queryByText(/queued change/i)).not.toBeInTheDocument()

    const store = usePendingChangesStore.getState()
    act(() => {
      store.add({ op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: 'a' })
      store.add({ op: { op: 'set', path: ['system', 'domain-name'], value: 'x.net' }, label: 'b' })
    })

    expect(
      screen.getByText(
        /2 queued changes were made against the current configuration; review or discard them after importing\./,
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /merge/i }))
    expect(screen.queryByText(/queued change/i)).not.toBeInTheDocument()
  })

  it('records a merge import as committed but not saved', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportConfigPanel />)

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile("set system host-name 'r1'\n"))
    const importButton = screen.getByRole('button', { name: /import configuration/i })
    await waitFor(() => expect(importButton).not.toBeDisabled())
    await user.click(importButton)
    await screen.findByText(/imported successfully/i)

    const committed = useUnsavedCommitStore.getState().committedChanges
    expect(committed).toHaveLength(1)
    expect(committed[0].label).toBe('import (merge)')
  })

  it('records a load import as committed but not saved once the commit is kept', async () => {
    server.use(http.post('/api/config/import', () => HttpResponse.json({ pendingConfirm: true })))
    const user = userEvent.setup()
    renderWithProviders(<ImportConfigPanel />)

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile("set system host-name 'r1'\n"))
    await user.click(screen.getByRole('radio', { name: /full replace/i }))
    await user.click(screen.getByRole('checkbox', { name: /i understand/i }))
    await user.click(screen.getByRole('button', { name: /import configuration/i }))
    await screen.findByText(/keep this imported configuration/i)
    expect(useUnsavedCommitStore.getState().committedChanges).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /keep changes/i }))
    await screen.findByText(/imported successfully/i)

    const committed = useUnsavedCommitStore.getState().committedChanges
    expect(committed).toHaveLength(1)
    expect(committed[0].label).toBe('import (load)')
  })

  it('leaves the confirm panel once the window runs out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      server.use(http.post('/api/config/import', () => HttpResponse.json({ pendingConfirm: true })))
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderWithProviders(<ImportConfigPanel />)

      await user.upload(screen.getByLabelText(/configuration file/i), makeFile("set system host-name 'r1'\n"))
      const importButton = screen.getByRole('button', { name: /import configuration/i })
      await waitFor(() => expect(importButton).not.toBeDisabled())
      await user.click(importButton)
      await screen.findByText(/keep this imported configuration/i)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(91_000)
      })

      expect(screen.queryByText(/keep this imported configuration/i)).not.toBeInTheDocument()
      expect(screen.getByText(/reverted the import/i)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('counts down the window VyOS reports, not the requested seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      server.use(
        http.post('/api/config/import', () => HttpResponse.json({ pendingConfirm: true, confirmSeconds: 120 })),
      )
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderWithProviders(<ImportConfigPanel />)

      await user.upload(screen.getByLabelText(/configuration file/i), makeFile("set system host-name 'r1'\n"))
      const importButton = screen.getByRole('button', { name: /import configuration/i })
      await waitFor(() => expect(importButton).not.toBeDisabled())
      await user.click(importButton)
      await screen.findByText(/keep this imported configuration/i)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100_000)
      })
      expect(screen.getByText(/keep this imported configuration/i)).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(21_000)
      })
      expect(screen.queryByText(/keep this imported configuration/i)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('starts the Safe apply seconds from the system info default', async () => {
    server.use(
      http.get('/api/system/info', () =>
        HttpResponse.json({ hostname: 'r', version: '1', loginBanner: '', safeApplyDefaultSeconds: 45 }),
      ),
    )
    renderWithProviders(<ImportConfigPanel />)

    await waitFor(() => expect(screen.getByRole('spinbutton')).toHaveValue(45))
  })

  it('requires acknowledgment before a full-replace (load) import is enabled', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportConfigPanel />)

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile('interfaces {\n}\n'))
    await user.click(screen.getByRole('radio', { name: /full replace/i }))

    const importButton = screen.getByRole('button', { name: /import configuration/i })
    expect(importButton).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: /i understand this may lock me out/i }))
    expect(importButton).not.toBeDisabled()
  })

  it('sends mode=load once acknowledged', async () => {
    const user = userEvent.setup()
    let receivedBody: unknown
    server.use(
      http.post('/api/config/import', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ pendingConfirm: false })
      }),
    )
    renderWithProviders(<ImportConfigPanel />)

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile('interfaces {\n}\n'))
    await user.click(screen.getByRole('radio', { name: /full replace/i }))
    await user.click(screen.getByRole('checkbox', { name: /i understand this may lock me out/i }))
    await user.click(screen.getByRole('button', { name: /import configuration/i }))

    expect(await screen.findByText(/imported successfully/i)).toBeInTheDocument()
    expect(receivedBody).toMatchObject({ mode: 'load' })
  })

  it('resets the load acknowledgment when switching back to merge', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportConfigPanel />)

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile('interfaces {\n}\n'))
    await user.click(screen.getByRole('radio', { name: /full replace/i }))
    await user.click(screen.getByRole('checkbox', { name: /i understand this may lock me out/i }))
    await user.click(screen.getByRole('radio', { name: /^merge/i }))
    await user.click(screen.getByRole('radio', { name: /full replace/i }))

    expect(screen.getByRole('checkbox', { name: /i understand this may lock me out/i })).not.toBeChecked()
  })

  it('shows a "Keep changes?" banner when the import starts a commit-confirm timer', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/config/import', () => HttpResponse.json({ pendingConfirm: true })),
      http.post('/api/config/commit/confirm', () => new HttpResponse(null, { status: 204 })),
    )
    renderWithProviders(<ImportConfigPanel />)

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile('interfaces {\n}\n'))
    await user.click(screen.getByRole('button', { name: /import configuration/i }))

    expect(await screen.findByText(/keep this imported configuration/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /keep changes/i }))

    expect(await screen.findByText(/imported successfully/i)).toBeInTheDocument()
  })

  it('shows an error message when the import fails', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/config/import', () => HttpResponse.json({ error: 'malformed config' }, { status: 422 })))
    renderWithProviders(<ImportConfigPanel />)

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile('bogus'))
    await user.click(screen.getByRole('button', { name: /import configuration/i }))

    expect(await screen.findByText(/malformed config/i)).toBeInTheDocument()
  })

  it('disables import when safe-apply seconds are out of range', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportConfigPanel />)

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile('interfaces {\n}\n'))
    const secondsInput = screen.getByDisplayValue('90')
    await user.clear(secondsInput)
    await user.type(secondsInput, '5')

    expect(screen.getByRole('button', { name: /import configuration/i })).toBeDisabled()
    expect(screen.getByText(/must be between/i)).toBeInTheDocument()
  })
})
