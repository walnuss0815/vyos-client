import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import KeyMaterialPage from './KeyMaterialPage'

const PKI = {
  'key-pair': { wg0: { public: { key: 'pub' }, private: { key: 'priv' } } },
  dh: { dh2048: { parameters: 'MIIB...' } },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: PKI })))
})

describe('KeyMaterialPage', () => {
  it('renders key-pairs and DH params', async () => {
    renderWithProviders(<KeyMaterialPage />)
    expect(await screen.findByText('wg0')).toBeInTheDocument()
    expect(screen.getByText('dh2048')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<KeyMaterialPage />)
    expect(await screen.findByText(/failed to load pki configuration/i)).toBeInTheDocument()
  })

  it('creates a new key-pair', async () => {
    const user = userEvent.setup()
    renderWithProviders(<KeyMaterialPage />)
    await screen.findByText('wg0')

    await user.click(screen.getByRole('button', { name: /\+ new key-pair/i }))
    await user.type(screen.getByLabelText(/^name/i), 'wg1')
    const [publicKeyField, privateKeyField] = screen.getAllByRole('textbox').filter((el) => el.tagName === 'TEXTAREA')
    await user.type(publicKeyField, 'newpublickey')
    await user.type(privateKeyField, 'newprivatekey')
    await user.click(screen.getByRole('button', { name: /queue key-pair creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['pki', 'key-pair', 'wg1', 'public', 'key'], value: 'newpublickey' },
        { op: 'set', path: ['pki', 'key-pair', 'wg1', 'private', 'key'], value: 'newprivatekey' },
      ]),
    )
  })

  it('deletes a key-pair', async () => {
    const user = userEvent.setup()
    renderWithProviders(<KeyMaterialPage />)
    await screen.findByText('wg0')

    const row = screen.getByText('wg0').closest('div.flex.items-center.justify-between')
    if (!row) throw new Error('key-pair row not found')
    await user.click(within(row as HTMLElement).getByRole('button', { name: /delete/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['pki', 'key-pair', 'wg0'] })
  })

  it('creates new DH parameters', async () => {
    const user = userEvent.setup()
    renderWithProviders(<KeyMaterialPage />)
    await screen.findByText('dh2048')

    await user.click(screen.getByRole('button', { name: /\+ new dh params/i }))
    await user.type(screen.getByLabelText(/^name/i), 'dh4096')
    await user.type(screen.getByLabelText(/parameters/i), 'MIIBnewdh')
    await user.click(screen.getByRole('button', { name: /queue dh creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['pki', 'dh', 'dh4096', 'parameters'],
      value: 'MIIBnewdh',
    })
  })

  it('deletes a DH entry', async () => {
    const user = userEvent.setup()
    renderWithProviders(<KeyMaterialPage />)
    await screen.findByText('dh2048')

    const row = screen.getByText('dh2048').closest('div.flex.items-center.justify-between')
    if (!row) throw new Error('DH row not found')
    await user.click(within(row as HTMLElement).getByRole('button', { name: /delete/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['pki', 'dh', 'dh2048'] })
  })
})
