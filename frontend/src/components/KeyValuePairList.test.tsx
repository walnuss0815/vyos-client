import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePendingChangesStore } from '../store/pendingChanges'
import KeyValuePairList from './KeyValuePairList'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

const basePath = ['container', 'name', 'web', 'environment']
const pathLabel = 'container name web environment'

describe('KeyValuePairList', () => {
  it('renders each item as an id = value entry', () => {
    render(
      <KeyValuePairList
        items={[
          { id: 'TZ', value: 'UTC' },
          { id: 'DEBUG', value: 'false' },
        ]}
        basePath={basePath}
        pathLabel={pathLabel}
      />,
    )
    expect(screen.getByText('TZ')).toBeInTheDocument()
    expect(screen.getByText('= UTC')).toBeInTheDocument()
    expect(screen.getByText('DEBUG')).toBeInTheDocument()
  })

  it('shows a placeholder message when there are no items', () => {
    render(<KeyValuePairList items={[]} basePath={basePath} pathLabel={pathLabel} />)
    expect(screen.getByText(/none configured/i)).toBeInTheDocument()
  })

  it('queues a set op with the id as a path segment when adding an entry', async () => {
    const user = userEvent.setup()
    render(<KeyValuePairList items={[]} basePath={basePath} pathLabel={pathLabel} />)

    const [idInput, valueInput] = screen.getAllByRole('textbox')
    await user.type(idInput, 'TZ')
    await user.type(valueInput, 'UTC')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: [...basePath, 'TZ', 'value'], value: 'UTC' })
  })

  it('queues a delete op for the whole entry when removing it', async () => {
    const user = userEvent.setup()
    render(
      <KeyValuePairList items={[{ id: 'TZ', value: 'UTC' }]} basePath={basePath} pathLabel={pathLabel} />,
    )

    await user.click(screen.getByLabelText('Remove TZ'))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: [...basePath, 'TZ'] })
  })

  it('disables Add until both an id and a value are entered', async () => {
    const user = userEvent.setup()
    render(<KeyValuePairList items={[]} basePath={basePath} pathLabel={pathLabel} />)

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()

    const [idInput] = screen.getAllByRole('textbox')
    await user.type(idInput, 'TZ')
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('disables Add and shows a message for an id that already exists', async () => {
    const user = userEvent.setup()
    render(
      <KeyValuePairList items={[{ id: 'TZ', value: 'UTC' }]} basePath={basePath} pathLabel={pathLabel} />,
    )

    const [idInput, valueInput] = screen.getAllByRole('textbox')
    await user.type(idInput, 'TZ')
    await user.type(valueInput, 'CET')

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(screen.getByText(/already used/i)).toBeInTheDocument()
    expect(usePendingChangesStore.getState().changes).toHaveLength(0)
  })

  // Regression coverage for the container-create-time feature: onAdd/
  // onRemove let a caller manage a not-yet-created parent's nested
  // entries as local draft state instead of immediately queuing a
  // real pending change - see ContainerCreateNestedSections.tsx.
  describe('with onAdd/onRemove overrides', () => {
    it('calls onAdd with the trimmed id and value instead of queuing a pending change', async () => {
      const user = userEvent.setup()
      const onAdd = vi.fn()
      render(<KeyValuePairList items={[]} basePath={basePath} pathLabel={pathLabel} onAdd={onAdd} />)

      const [idInput, valueInput] = screen.getAllByRole('textbox')
      await user.type(idInput, '  TZ  ')
      await user.type(valueInput, 'UTC')
      await user.click(screen.getByRole('button', { name: 'Add' }))

      expect(onAdd).toHaveBeenCalledExactlyOnceWith('TZ', 'UTC')
      expect(usePendingChangesStore.getState().changes).toHaveLength(0)
    })

    it('calls onRemove with the id instead of queuing a pending change', async () => {
      const user = userEvent.setup()
      const onRemove = vi.fn()
      render(
        <KeyValuePairList
          items={[{ id: 'TZ', value: 'UTC' }]}
          basePath={basePath}
          pathLabel={pathLabel}
          onRemove={onRemove}
        />,
      )

      await user.click(screen.getByLabelText('Remove TZ'))

      expect(onRemove).toHaveBeenCalledExactlyOnceWith('TZ')
      expect(usePendingChangesStore.getState().changes).toHaveLength(0)
    })

    it('still duplicate-checks and clears the inputs against whatever items is set to', async () => {
      const user = userEvent.setup()
      const onAdd = vi.fn()
      render(
        <KeyValuePairList
          items={[{ id: 'TZ', value: 'UTC' }]}
          basePath={basePath}
          pathLabel={pathLabel}
          onAdd={onAdd}
        />,
      )

      const [idInput, valueInput] = screen.getAllByRole('textbox')
      await user.type(idInput, 'TZ')
      await user.type(valueInput, 'CET')
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()

      await user.clear(idInput)
      await user.type(idInput, 'DEBUG')
      await user.click(screen.getByRole('button', { name: 'Add' }))

      expect(onAdd).toHaveBeenCalledExactlyOnceWith('DEBUG', 'CET')
      expect(idInput).toHaveValue('')
      expect(valueInput).toHaveValue('')
    })
  })
})
