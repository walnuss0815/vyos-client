import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useRefreshSettingsStore } from '../store/refreshSettings'
import RefreshControl from './RefreshControl'

beforeEach(() => {
  localStorage.clear()
  useRefreshSettingsStore.setState({ enabled: true, intervalSeconds: 30 })
})

describe('RefreshControl', () => {
  it('shows the interval picker with the current interval selected when enabled', () => {
    render(<RefreshControl />)
    expect(screen.getByRole('checkbox', { name: /auto-refresh/i })).toBeChecked()
    expect(screen.getByRole('combobox', { name: /auto-refresh interval/i })).toHaveValue('30')
  })

  it('hides the interval picker when auto-refresh is toggled off', async () => {
    const user = userEvent.setup()
    render(<RefreshControl />)

    await user.click(screen.getByRole('checkbox', { name: /auto-refresh/i }))

    expect(screen.queryByRole('combobox', { name: /auto-refresh interval/i })).not.toBeInTheDocument()
    expect(useRefreshSettingsStore.getState().enabled).toBe(false)
  })

  it('updates the stored interval when a new one is selected', async () => {
    const user = userEvent.setup()
    render(<RefreshControl />)

    await user.selectOptions(screen.getByRole('combobox', { name: /auto-refresh interval/i }), '60')

    expect(useRefreshSettingsStore.getState().intervalSeconds).toBe(60)
  })
})
