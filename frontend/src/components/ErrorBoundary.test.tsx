import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('boom: simulated DOM reconciliation failure')
  }
  return <p>All good</p>
}

describe('ErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('shows a recoverable fallback instead of a blank page when a child throws', () => {
    // React logs the error to the console by default; keep test output clean.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText(/boom: simulated DOM reconciliation failure/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument()

    consoleError.mockRestore()
  })

  it('recovers when "Try again" is clicked and the child no longer throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()

    const { rerender } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    // Re-rendering with a child that would no longer throw must NOT by
    // itself clear the fallback - a tripped error boundary keeps
    // showing the fallback until something explicitly resets its
    // state. This is real React behavior; asserting it here guards
    // against accidentally "fixing" the boundary into auto-clearing,
    // which would hide genuinely broken re-renders instead of letting
    // the user retry deliberately.
    rerender(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(screen.getByText('All good')).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
