import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import InfoTooltip from './InfoTooltip'

describe('InfoTooltip', () => {
  it('renders the hint text in a tooltip role, described by an accessible label', () => {
    render(<InfoTooltip text="Diffie-Hellman group used for key exchange strength." />)
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Diffie-Hellman group used for key exchange strength.',
    )
    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Diffie-Hellman group used for key exchange strength.',
    )
  })
})
