import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import CAsPage from './CAsPage'

const PKI = {
  ca: {
    vyos_root_ca: {
      description: 'Root CA',
      certificate: 'MIIB...',
      crl: ['MIIC...'],
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: PKI })))
})

describe('CAsPage', () => {
  it('renders a CA with its CRL', async () => {
    renderWithProviders(<CAsPage />)
    expect(await screen.findByText('vyos_root_ca')).toBeInTheDocument()
    expect(screen.getByText('Root CA')).toBeInTheDocument()
    expect(screen.getByText('MIIC...')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<CAsPage />)
    expect(await screen.findByText(/failed to load pki configuration/i)).toBeInTheDocument()
  })

  it('creates a new CA', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CAsPage />)
    await screen.findByText('vyos_root_ca')

    await user.click(screen.getByRole('button', { name: /\+ new ca/i }))
    await user.type(screen.getByLabelText(/^name/i), 'vyos_server_ca')
    await user.type(screen.getByPlaceholderText('MIIB...'), 'MIIBnewcert')
    await user.click(screen.getByRole('button', { name: /queue ca creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['pki', 'ca', 'vyos_server_ca', 'certificate'],
      value: 'MIIBnewcert',
    })
  })

  it('deletes a CA', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CAsPage />)
    await screen.findByText('vyos_root_ca')

    const card = screen.getByText('vyos_root_ca').closest('div.rounded-xl')
    if (!card) throw new Error('CA card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^delete$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['pki', 'ca', 'vyos_root_ca'] })
  })

  it('adds a CRL entry via the ChipList', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CAsPage />)
    await screen.findByText('vyos_root_ca')

    await user.type(screen.getByPlaceholderText(/PEM, single line/i), 'MIIDnewcrl')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['pki', 'ca', 'vyos_root_ca', 'crl'],
      value: 'MIIDnewcrl',
    })
  })

  it('always queues a fresh private key when editing and typing one', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CAsPage />)
    await screen.findByText('vyos_root_ca')

    const card = screen.getByText('vyos_root_ca').closest('div.rounded-xl')
    if (!card) throw new Error('CA card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^edit$/i }))

    const keyField = screen.getByPlaceholderText(/PEM, single line, no BEGIN\/END markers/i)
    await user.type(keyField, 'MIIEnewkey')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['pki', 'ca', 'vyos_root_ca', 'private', 'key'],
      value: 'MIIEnewkey',
    })
  })

  it("shows an expiry badge sourced from the CA's parsed validity window", async () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    server.use(
      http.get('/api/pki/expiry', () =>
        HttpResponse.json({ certificates: [], cas: [{ name: 'vyos_root_ca', notAfter: farFuture }] }),
      ),
    )
    renderWithProviders(<CAsPage />)
    await screen.findByText('vyos_root_ca')
    expect(await screen.findByText(/^expires /i)).toBeInTheDocument()
  })
})
