import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Modal from './Modal'

describe('Modal', () => {
  it('renders the title, children, and footer', () => {
    render(
      <Modal title="Confirm action" onClose={() => {}} footer={<button>Save</button>}>
        <p>Are you sure?</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog', { name: 'Confirm action' })).toBeInTheDocument()
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('omits the footer row when none is given', () => {
    render(
      <Modal title="Info only" onClose={() => {}}>
        <p>Just some text.</p>
      </Modal>,
    )
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('calls onClose when the Close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal title="Confirm action" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    )
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal title="Confirm action" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    )
    // The backdrop is the aria-hidden sibling of the dialog panel.
    const backdrop = document.querySelector('[aria-hidden="true"]')
    if (!backdrop) throw new Error('backdrop not found')
    await user.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal title="Confirm action" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not call onClose when clicking inside the dialog panel', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal title="Confirm action" onClose={onClose}>
        <p>Body text</p>
      </Modal>,
    )
    await user.click(screen.getByText('Body text'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
