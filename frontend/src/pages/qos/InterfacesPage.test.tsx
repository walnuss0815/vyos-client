import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InterfacesPage from './InterfacesPage'

const QOS_CONFIG = {
  interface: { eth0: { ingress: 'IN-LIMIT', egress: 'WAN-OUT' } },
  policy: {
    shaper: { 'WAN-OUT': {} },
    limiter: { 'IN-LIMIT': {} },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: QOS_CONFIG })))
})

describe('InterfacesPage', () => {
  it('shows an error message when the config fails to load', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<InterfacesPage />)
    expect(await screen.findByText(/failed to load qos configuration/i)).toBeInTheDocument()
  })

  it('renders the existing binding with its ingress/egress policies selected', async () => {
    renderWithProviders(<InterfacesPage />)
    expect(await screen.findByText('eth0')).toBeInTheDocument()
    expect(screen.getByLabelText('Ingress (limiter only)')).toHaveValue('IN-LIMIT')
    expect(screen.getByLabelText('Egress')).toHaveValue('WAN-OUT')
  })

  it('deletes an interface binding', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InterfacesPage />)
    await screen.findByText('eth0')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const { changes } = usePendingChangesStore.getState()
    expect(changes).toContainEqual(
      expect.objectContaining({ op: { op: 'delete', path: ['qos', 'interface', 'eth0'] } }),
    )
  })

  it('sets the egress policy when changed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InterfacesPage />)
    await screen.findByText('eth0')

    await user.selectOptions(screen.getByLabelText('Egress'), '(none)')
    const { changes } = usePendingChangesStore.getState()
    expect(changes).toContainEqual(
      expect.objectContaining({ op: { op: 'delete', path: ['qos', 'interface', 'eth0', 'egress'] } }),
    )
  })
})
