import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import GlobalOptionsPage from './GlobalOptionsPage'

const FIREWALL_CONFIG = {
  'global-options': {
    'all-ping': 'enable',
    'state-policy': { established: { action: 'accept' } },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: FIREWALL_CONFIG })))
})

describe('GlobalOptionsPage', () => {
  it('reflects the current configured values in the selects', async () => {
    renderWithProviders(<GlobalOptionsPage />)
    expect(await screen.findByText('Respond to all ping to the router')).toBeInTheDocument()
    expect(screen.getByLabelText(/respond to all ping/i)).toHaveValue('enable')
    expect(screen.getByLabelText(/established connections/i)).toHaveValue('accept')
    expect(screen.getByLabelText(/related connections/i)).toHaveValue('')
  })

  it('queues a global-options change', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GlobalOptionsPage />)
    await screen.findByText('Respond to all ping to the router')

    await user.selectOptions(screen.getByLabelText(/tcp syn cookies/i), 'enable')

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['firewall', 'global-options', 'syn-cookies'],
      value: 'enable',
    })
  })

  it('queues a state-policy action change with the correct nested path', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GlobalOptionsPage />)
    await screen.findByText('Respond to all ping to the router')

    await user.selectOptions(screen.getByLabelText(/invalid connections/i), 'drop')

    const { changes } = usePendingChangesStore.getState()
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['firewall', 'global-options', 'state-policy', 'invalid', 'action'],
      value: 'drop',
    })
  })
})
