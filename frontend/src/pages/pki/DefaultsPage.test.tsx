import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import DefaultsPage from './DefaultsPage'

const PKI = { x509: { default: { country: 'GB', organization: 'VyOS' } } }

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: PKI })))
})

describe('DefaultsPage', () => {
  it('renders existing default values', async () => {
    renderWithProviders(<DefaultsPage />)
    expect(await screen.findByDisplayValue('GB')).toBeInTheDocument()
    expect(screen.getByDisplayValue('VyOS')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<DefaultsPage />)
    expect(await screen.findByText(/failed to load pki configuration/i)).toBeInTheDocument()
  })

  it('saves a changed default field', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DefaultsPage />)
    const countryInput = await screen.findByDisplayValue('GB')

    await user.clear(countryInput)
    await user.type(countryInput, 'US')
    await user.click(screen.getByRole('button', { name: /save defaults/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['pki', 'x509', 'default', 'country'], value: 'US' })
  })
})
