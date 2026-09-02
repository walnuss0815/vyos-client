import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useUnsavedCommitStore } from '../../store/unsavedCommit'
import PowerPage from './PowerPage'

beforeEach(() => {
  localStorage.clear()
  useUnsavedCommitStore.setState({ committedChanges: [] })
})

describe('PowerPage', () => {
  it('nudges toward exporting the configuration before a reboot/poweroff', () => {
    renderWithProviders(<PowerPage />)
    expect(screen.getByRole('link', { name: /exporting a copy of the current configuration/i })).toHaveAttribute(
      'href',
      '/config-tree',
    )
  })
})

describe('PowerPage - reboot', () => {
  it('requires a second click to confirm, then sends the reboot command', async () => {
    const user = userEvent.setup()
    let rebootCallCount = 0
    server.use(http.post('/api/system/reboot', () => {
      rebootCallCount++
      return new HttpResponse(null, { status: 204 })
    }))
    renderWithProviders(<PowerPage />)

    await user.click(screen.getByRole('button', { name: 'Reboot' }))
    expect(screen.getByRole('button', { name: 'Confirm reboot?' })).toBeInTheDocument()
    expect(rebootCallCount).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Confirm reboot?' }))
    await waitFor(() => expect(rebootCallCount).toBe(1))
    expect(await screen.findByText(/reboot command sent/i)).toBeInTheDocument()
  })

  it('shows an error message when the reboot request fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/system/reboot', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })),
    )
    renderWithProviders(<PowerPage />)

    await user.click(screen.getByRole('button', { name: 'Reboot' }))
    await user.click(screen.getByRole('button', { name: 'Confirm reboot?' }))

    expect(await screen.findByText(/unreachable/i)).toBeInTheDocument()
  })
})

describe('PowerPage - poweroff', () => {
  it('disables the confirm button until the router hostname is typed exactly', async () => {
    const user = userEvent.setup()
    let poweroffCallCount = 0
    server.use(
      http.get('/api/system/info', () => HttpResponse.json({ hostname: 'router1', version: '1.5-rolling' })),
      http.post('/api/system/poweroff', () => {
        poweroffCallCount++
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderWithProviders(<PowerPage />)

    await user.click(screen.getByRole('button', { name: /power off…/i }))
    expect(await screen.findByText('router1', { selector: 'span' })).toBeInTheDocument()
    const confirmButton = screen.getByRole('button', { name: 'Power off now' })
    expect(confirmButton).toBeDisabled()

    await user.type(screen.getByLabelText(/hostname/i), 'wrong-name')
    expect(confirmButton).toBeDisabled()
    expect(poweroffCallCount).toBe(0)

    await user.clear(screen.getByLabelText(/hostname/i))
    await user.type(screen.getByLabelText(/hostname/i), 'router1')
    expect(confirmButton).not.toBeDisabled()

    await user.click(confirmButton)
    await waitFor(() => expect(poweroffCallCount).toBe(1))
    expect(await screen.findByText(/poweroff command sent/i)).toBeInTheDocument()
  })

  it('shows an error message when the poweroff request fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/system/info', () => HttpResponse.json({ hostname: 'router1', version: '1.5-rolling' })),
      http.post('/api/system/poweroff', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })),
    )
    renderWithProviders(<PowerPage />)

    await user.click(screen.getByRole('button', { name: /power off…/i }))
    await screen.findByLabelText(/hostname/i)
    await user.type(screen.getByLabelText(/hostname/i), 'router1')
    await user.click(screen.getByRole('button', { name: 'Power off now' }))

    expect(await screen.findByText(/unreachable/i)).toBeInTheDocument()
  })

  it('closes the modal on cancel without powering off', async () => {
    const user = userEvent.setup()
    let poweroffCallCount = 0
    server.use(
      http.get('/api/system/info', () => HttpResponse.json({ hostname: 'router1', version: '1.5-rolling' })),
      http.post('/api/system/poweroff', () => {
        poweroffCallCount++
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderWithProviders(<PowerPage />)

    await user.click(screen.getByRole('button', { name: /power off…/i }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(poweroffCallCount).toBe(0)
  })
})

describe('PowerPage - save configuration', () => {
  it('is always available and repeatable, independent of any pending changes', async () => {
    const user = userEvent.setup()
    let saveCallCount = 0
    server.use(
      http.post('/api/config/save', () => {
        saveCallCount++
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderWithProviders(<PowerPage />)

    await user.click(screen.getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(saveCallCount).toBe(1))
    expect(await screen.findByText(/configuration saved/i)).toBeInTheDocument()

    // Repeatable - unlike Reboot/Poweroff, a successful save doesn't
    // permanently replace the button with a done-state message.
    await user.click(screen.getByRole('button', { name: 'Save now' }))
    await waitFor(() => expect(saveCallCount).toBe(2))
  })

  it('clears a pending "committed but not saved" flag on success', async () => {
    server.use(http.post('/api/config/save', () => new HttpResponse(null, { status: 204 })))
    useUnsavedCommitStore.setState({
      committedChanges: [{ id: 'c1', op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: '' }],
    })
    const user = userEvent.setup()
    renderWithProviders(<PowerPage />)

    await user.click(screen.getByRole('button', { name: 'Save now' }))

    await waitFor(() => {
      expect(useUnsavedCommitStore.getState().committedChanges).toHaveLength(0)
    })
  })

  it('shows an error message when the save request fails', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/config/save', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<PowerPage />)

    await user.click(screen.getByRole('button', { name: 'Save now' }))

    expect(await screen.findByText(/unreachable/i)).toBeInTheDocument()
  })
})

describe('PowerPage - rollback', () => {
  it('requires a second click to confirm, then always requests a commit-confirm window', async () => {
    const user = userEvent.setup()
    let requestedConfirmSeconds: number | undefined
    server.use(
      http.post('/api/config/rollback', async ({ request }) => {
        const body = (await request.json()) as { confirmSeconds?: number }
        requestedConfirmSeconds = body.confirmSeconds
        return HttpResponse.json({ pendingConfirm: false })
      }),
    )
    renderWithProviders(<PowerPage />)

    await user.click(screen.getByRole('button', { name: 'Rollback' }))
    expect(screen.getByRole('button', { name: 'Confirm rollback?' })).toBeInTheDocument()
    expect(requestedConfirmSeconds).toBeUndefined()

    await user.click(screen.getByRole('button', { name: 'Confirm rollback?' }))
    expect(await screen.findByText(/rolled back to the last saved configuration/i)).toBeInTheDocument()
    expect(requestedConfirmSeconds).toBeGreaterThan(0)
  })

  it('clears a pending "committed but not saved" flag on success', async () => {
    server.use(http.post('/api/config/rollback', () => HttpResponse.json({ pendingConfirm: false })))
    useUnsavedCommitStore.setState({
      committedChanges: [{ id: 'c1', op: { op: 'set', path: ['system', 'host-name'], value: 'r1' }, label: '' }],
    })
    const user = userEvent.setup()
    renderWithProviders(<PowerPage />)

    await user.click(screen.getByRole('button', { name: 'Rollback' }))
    await user.click(screen.getByRole('button', { name: 'Confirm rollback?' }))

    await waitFor(() => {
      expect(useUnsavedCommitStore.getState().committedChanges).toHaveLength(0)
    })
  })

  it('shows a "Keep this rollback" prompt when VyOS starts a commit-confirm timer, then confirms it', async () => {
    server.use(
      http.post('/api/config/rollback', () => HttpResponse.json({ pendingConfirm: true })),
      http.post('/api/config/commit/confirm', () => new HttpResponse(null, { status: 204 })),
    )
    const user = userEvent.setup()
    renderWithProviders(<PowerPage />)

    await user.click(screen.getByRole('button', { name: 'Rollback' }))
    await user.click(screen.getByRole('button', { name: 'Confirm rollback?' }))

    const keepButton = await screen.findByRole('button', { name: /keep this rollback/i })
    await user.click(keepButton)

    expect(await screen.findByText(/rolled back to the last saved configuration/i)).toBeInTheDocument()
  })

  it('shows an error message when the rollback request fails', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/config/rollback', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<PowerPage />)

    await user.click(screen.getByRole('button', { name: 'Rollback' }))
    await user.click(screen.getByRole('button', { name: 'Confirm rollback?' }))

    expect(await screen.findByText(/unreachable/i)).toBeInTheDocument()
  })
})
