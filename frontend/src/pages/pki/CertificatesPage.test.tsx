import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import CertificatesPage from './CertificatesPage'

const PKI = {
  certificate: {
    vyos_cert: {
      certificate: 'MIIB...',
      acme: { 'domain-name': ['vyos.example.com'] },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: PKI })))
})

describe('CertificatesPage', () => {
  it('renders a certificate with its ACME domain names', async () => {
    renderWithProviders(<CertificatesPage />)
    expect(await screen.findByText('vyos_cert')).toBeInTheDocument()
    expect(screen.getByText('vyos.example.com')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<CertificatesPage />)
    expect(await screen.findByText(/failed to load pki configuration/i)).toBeInTheDocument()
  })

  it('creates a new certificate with ACME settings', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CertificatesPage />)
    await screen.findByText('vyos_cert')

    await user.click(screen.getByRole('button', { name: /\+ new certificate/i }))
    await user.type(screen.getByLabelText(/^name/i), 'new_cert')
    await user.click(screen.getByRole('button', { name: 'acme' }))
    await user.type(screen.getByPlaceholderText('admin@example.com'), 'me@example.com')
    await user.click(screen.getByRole('button', { name: /queue certificate creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['pki', 'certificate', 'new_cert', 'acme', 'email'],
      value: 'me@example.com',
    })
  })

  it('deletes a certificate', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CertificatesPage />)
    await screen.findByText('vyos_cert')

    const card = screen.getByText('vyos_cert').closest('div.rounded-xl')
    if (!card) throw new Error('certificate card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^delete$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['pki', 'certificate', 'vyos_cert'] })
  })

  it('adds an ACME domain name via the ChipList', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CertificatesPage />)
    await screen.findByText('vyos_cert')

    await user.type(screen.getByPlaceholderText('example.com'), 'www.vyos.example.com')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['pki', 'certificate', 'vyos_cert', 'acme', 'domain-name'],
      value: 'www.vyos.example.com',
    })
  })

  it("shows an expiry badge sourced from the certificate's parsed validity window", async () => {
    server.use(
      http.get('/api/pki/expiry', () =>
        HttpResponse.json({
          certificates: [{ name: 'vyos_cert', notAfter: '2000-01-01T00:00:00Z' }],
          cas: [],
        }),
      ),
    )
    renderWithProviders(<CertificatesPage />)
    await screen.findByText('vyos_cert')
    expect(await screen.findByText(/^expired /i)).toBeInTheDocument()
  })

  it('shows no expiry badge for a certificate the expiry endpoint has no entry for', async () => {
    server.use(http.get('/api/pki/expiry', () => HttpResponse.json({ certificates: [], cas: [] })))
    renderWithProviders(<CertificatesPage />)
    await screen.findByText('vyos_cert')
    expect(screen.queryByText(/expire/i)).not.toBeInTheDocument()
  })
})
