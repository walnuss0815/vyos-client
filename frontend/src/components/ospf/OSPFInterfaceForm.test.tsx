import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import type { OSPFInterface } from '../../lib/ospfTypes'
import OSPFInterfaceForm from './OSPFInterfaceForm'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

function emptyInterface(overrides: Partial<OSPFInterface> = {}): OSPFInterface {
  return {
    name: 'eth0',
    passive: false,
    mtuIgnore: false,
    bfd: false,
    hasPlaintextPassword: false,
    hasMd5Key: false,
    ...overrides,
  }
}

describe('OSPFInterfaceForm - authentication UI (ospf only)', () => {
  it('does not show the authentication section for ospfv3', () => {
    renderWithProviders(
      <OSPFInterfaceForm protocol="ospfv3" existingNames={[]} onDone={() => {}} />,
    )
    expect(screen.queryByLabelText(/authentication/i)).not.toBeInTheDocument()
  })

  it('reveals the password field only when plaintext-password mode is selected', async () => {
    const user = userEvent.setup()
    renderWithProviders(<OSPFInterfaceForm protocol="ospf" existingNames={[]} onDone={() => {}} />)

    expect(screen.queryByLabelText(/^password/i)).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/authentication/i), 'plaintext-password')
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
  })

  it('reveals key-id/key fields only when md5 mode is selected', async () => {
    const user = userEvent.setup()
    renderWithProviders(<OSPFInterfaceForm protocol="ospf" existingNames={[]} onDone={() => {}} />)

    expect(screen.queryByLabelText(/key id/i)).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/authentication/i), 'md5')
    expect(screen.getByLabelText(/key id/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/up to 16 characters/i)).toBeInTheDocument()
  })

  it('queues a full interface + md5 authentication creation', async () => {
    const user = userEvent.setup()
    renderWithProviders(<OSPFInterfaceForm protocol="ospf" existingNames={[]} onDone={() => {}} />)

    await user.type(screen.getByLabelText(/interface \*/i), 'eth0')
    await user.selectOptions(screen.getByLabelText(/authentication/i), 'md5')
    await user.type(screen.getByLabelText(/key id/i), '1')
    await user.type(screen.getByPlaceholderText(/up to 16 characters/i), 'secret')
    await user.click(screen.getByRole('button', { name: /queue interface creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toEqual([
      {
        op: 'set',
        path: ['protocols', 'ospf', 'interface', 'eth0', 'authentication', 'md5', 'key-id', '1'],
      },
      {
        op: 'set',
        path: [
          'protocols',
          'ospf',
          'interface',
          'eth0',
          'authentication',
          'md5',
          'key-id',
          '1',
          'md5-key',
        ],
        value: 'secret',
      },
    ])
  })

  it('shows a "Clear authentication" shortcut only when editing an interface with auth configured', () => {
    const withAuth = emptyInterface({ authMode: 'null' })
    const { unmount } = renderWithProviders(
      <OSPFInterfaceForm protocol="ospf" iface={withAuth} existingNames={[]} onDone={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /clear authentication/i })).toBeInTheDocument()
    unmount()

    const withoutAuth = emptyInterface()
    renderWithProviders(
      <OSPFInterfaceForm protocol="ospf" iface={withoutAuth} existingNames={[]} onDone={() => {}} />,
    )
    expect(screen.queryByRole('button', { name: /clear authentication/i })).not.toBeInTheDocument()
  })

  it('queues a delete for the whole authentication node via "Clear authentication"', async () => {
    const user = userEvent.setup()
    const iface = emptyInterface({ authMode: 'plaintext-password', hasPlaintextPassword: true })
    renderWithProviders(
      <OSPFInterfaceForm protocol="ospf" iface={iface} existingNames={[]} onDone={() => {}} />,
    )
    await user.click(screen.getByRole('button', { name: /clear authentication/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual([
      expect.objectContaining({
        op: { op: 'delete', path: ['protocols', 'ospf', 'interface', 'eth0', 'authentication'] },
      }),
    ])
  })
})

describe('OSPFInterfaceForm - basic fields', () => {
  it('disables the interface name field while editing', () => {
    renderWithProviders(
      <OSPFInterfaceForm protocol="ospf" iface={emptyInterface()} existingNames={[]} onDone={() => {}} />,
    )
    expect(screen.getByLabelText(/interface \*/i)).toBeDisabled()
  })

  it('offers protocol-specific network type options', async () => {
    const user = userEvent.setup()
    const { unmount } = renderWithProviders(
      <OSPFInterfaceForm protocol="ospf" existingNames={[]} onDone={() => {}} />,
    )
    await user.click(screen.getByLabelText(/network type/i))
    expect(screen.getByRole('option', { name: 'non-broadcast' })).toBeInTheDocument()
    unmount()

    renderWithProviders(<OSPFInterfaceForm protocol="ospfv3" existingNames={[]} onDone={() => {}} />)
    expect(screen.queryByRole('option', { name: 'non-broadcast' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'point-to-point' })).toBeInTheDocument()
  })
})
