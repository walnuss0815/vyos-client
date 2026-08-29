import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SortableHeader from './SortableHeader'

describe('SortableHeader', () => {
  it('renders the label and calls onClick when clicked', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader label="Name" active={false} direction="asc" onClick={onClick} />
          </tr>
        </thead>
      </table>,
    )
    await user.click(screen.getByRole('button', { name: 'Name' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('marks the column as aria-sort="none" when inactive', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader label="Name" active={false} direction="asc" onClick={() => {}} />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'none')
  })

  it('marks the column as aria-sort="ascending" when active and ascending', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader label="Name" active direction="asc" onClick={() => {}} />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('marks the column as aria-sort="descending" when active and descending', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader label="Name" active direction="desc" onClick={() => {}} />
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending')
  })
})
