import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import PowerPage from './PowerPage'

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
