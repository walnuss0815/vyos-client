import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/testUtils'
import ConfigTreePage from './ConfigTreePage'

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url') as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn()
  HTMLAnchorElement.prototype.click = vi.fn()
})

describe('ConfigTreePage', () => {
  it('downloads the tree as JSON once loaded', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConfigTreePage />)

    const button = await screen.findByRole('button', { name: /download json/i })
    await user.click(button)

    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
  })

  it('disables the JSON download button until the tree has loaded', () => {
    renderWithProviders(<ConfigTreePage />)
    expect(screen.getByRole('button', { name: /download json/i })).toBeDisabled()
  })

  it('downloads set commands once switched to that view and loaded', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConfigTreePage />)

    await user.click(screen.getByRole('button', { name: 'Set commands' }))
    const button = await screen.findByRole('button', { name: /^download$/i })
    expect(button).not.toBeDisabled()
    await user.click(button)

    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
  })

  it('shows the import panel once switched to that view', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConfigTreePage />)

    await user.click(screen.getByRole('button', { name: 'Import' }))
    expect(screen.getByLabelText(/configuration file/i)).toBeInTheDocument()
  })
})
