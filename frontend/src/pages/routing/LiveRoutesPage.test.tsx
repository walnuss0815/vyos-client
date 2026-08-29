import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useRefreshSettingsStore } from '../../store/refreshSettings'
import LiveRoutesPage from './LiveRoutesPage'

beforeEach(() => {
  localStorage.clear()
  useRefreshSettingsStore.setState({ enabled: true, intervalSeconds: 30 })
})

describe('LiveRoutesPage', () => {
  it('renders separate IPv4 and IPv6 sections with their own counts and the refresh control', async () => {
    server.use(
      http.get('/api/routes', () =>
        HttpResponse.json({
          ipv4: [
            { prefix: '0.0.0.0/0', protocol: 'static', selected: true, distance: 1, metric: 0, nexthops: [] },
          ],
          ipv6: [
            { prefix: '::/0', protocol: 'static', selected: true, distance: 1, metric: 0, nexthops: [] },
          ],
        }),
      ),
    )
    renderWithProviders(<LiveRoutesPage />)

    expect(await screen.findByText('0.0.0.0/0')).toBeInTheDocument()
    expect(screen.getByText('::/0')).toBeInTheDocument()
    expect(screen.getByText('IPv4 (1)')).toBeInTheDocument()
    expect(screen.getByText('IPv6 (1)')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /auto-refresh/i })).toBeInTheDocument()
  })

  it('shows an error message when the routes query fails', async () => {
    server.use(http.get('/api/routes', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<LiveRoutesPage />)

    expect(await screen.findByText(/failed to load routing information/i)).toBeInTheDocument()
  })
})
