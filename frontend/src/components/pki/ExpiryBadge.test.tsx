import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ExpiryBadge from './ExpiryBadge'

const DAY_MS = 1000 * 60 * 60 * 24

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString()
}

describe('ExpiryBadge', () => {
  it('renders nothing when entry is undefined', () => {
    const { container } = render(<ExpiryBadge entry={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the entry has no notAfter (no certificate stored/parse error)', () => {
    const { container } = render(<ExpiryBadge entry={{ name: 'x', error: 'no certificate stored' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a plain "expires" note for a certificate comfortably valid', () => {
    render(<ExpiryBadge entry={{ name: 'x', notAfter: isoDaysFromNow(365) }} />)
    expect(screen.getByText(/^expires /i)).toBeInTheDocument()
    expect(screen.queryByText(/expires in/i)).not.toBeInTheDocument()
  })

  it('shows an amber "expires in Nd" warning within the expiring-soon window', () => {
    render(<ExpiryBadge entry={{ name: 'x', notAfter: isoDaysFromNow(10) }} />)
    expect(screen.getByText(/expires in (9|10)d/i)).toBeInTheDocument()
  })

  it('shows a red "expired" badge for a past notAfter', () => {
    render(<ExpiryBadge entry={{ name: 'x', notAfter: isoDaysFromNow(-30) }} />)
    expect(screen.getByText(/^expired /i)).toBeInTheDocument()
  })
})
