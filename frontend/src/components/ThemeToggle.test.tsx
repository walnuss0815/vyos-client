import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from '../store/theme'
import ThemeToggle from './ThemeToggle'

beforeEach(() => {
  localStorage.clear()
  useThemeStore.setState({ mode: 'auto' })
})

describe('ThemeToggle', () => {
  it('renders light/dark/auto buttons with the current mode pressed', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'Light theme' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: 'Follow system theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('switches the theme mode on click', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: 'Dark theme' }))
    expect(useThemeStore.getState().mode).toBe('dark')
    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Light theme' }))
    expect(useThemeStore.getState().mode).toBe('light')
  })
})
