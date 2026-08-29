import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useRefreshSettingsStore } from '../../store/refreshSettings'
import LiveStatePage from './LiveStatePage'

beforeEach(() => {
  localStorage.clear()
  useRefreshSettingsStore.setState({ enabled: true, intervalSeconds: 30 })
})

describe('LiveStatePage', () => {
  it('renders the full interface list, including the refresh control', async () => {
    server.use(
      http.get('/api/interfaces', () =>
        HttpResponse.json({
          interfaces: [
            {
              name: 'eth0',
              mac: '52:54:00:12:34:56',
              mtu: 1500,
              operState: 'up',
              adminState: 'up',
              addresses: [{ family: 'inet', address: '203.0.113.5', prefixLen: 24, scope: 'global' }],
            },
          ],
        }),
      ),
    )
    renderWithProviders(<LiveStatePage />)

    expect(await screen.findByText('eth0')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /auto-refresh/i })).toBeInTheDocument()
  })

  it('shows an error message when the interfaces query fails', async () => {
    server.use(
      http.get('/api/interfaces', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })),
    )
    renderWithProviders(<LiveStatePage />)

    expect(await screen.findByText(/failed to load interfaces/i)).toBeInTheDocument()
  })
})
