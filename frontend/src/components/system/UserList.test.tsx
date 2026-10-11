import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { SystemUser } from '../../lib/systemTypes'
import UserList from './UserList'

const user = (username: string): SystemUser => ({ username, disabled: false, hasPassword: true, publicKeys: [] })

describe('UserList', () => {
  // Regression: the edit form used to be reused across rows, so its
  // initial state kept the first row's values after clicking Edit on
  // another one.
  it('shows the newly selected user when Edit is clicked on another row while a form is open', async () => {
    const interaction = userEvent.setup()
    render(<UserList users={[user('alice'), user('bob')]} isLoading={false} />)

    const [editAlice, editBob] = screen.getAllByRole('button', { name: 'Edit' })
    await interaction.click(editAlice)
    expect(screen.getByDisplayValue('alice')).toBeInTheDocument()

    await interaction.click(editBob)
    expect(screen.getByDisplayValue('bob')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('alice')).not.toBeInTheDocument()
  })
})
