import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FieldLabel from './FieldLabel'

describe('FieldLabel', () => {
  it('renders the label text and children like a plain label when no hint is given', () => {
    render(
      <FieldLabel label="Name">
        <input aria-label="Name" />
      </FieldLabel>,
    )
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders an InfoTooltip next to the label text when a hint is given', () => {
    render(
      <FieldLabel label="PFS" hint="Requires a fresh key exchange per rekey, not just a rehash.">
        <select aria-label="PFS" />
      </FieldLabel>,
    )
    expect(screen.getByLabelText('PFS')).toBeInTheDocument()
    expect(screen.getByRole('tooltip')).toHaveTextContent(/fresh key exchange/i)
  })
})
