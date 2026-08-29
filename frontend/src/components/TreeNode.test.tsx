import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../test/mocks/server'
import { usePendingChangesStore } from '../store/pendingChanges'
import TreeNode from './TreeNode'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

describe('TreeNode', () => {
  it('renders a scalar leaf and queues a set op when edited', async () => {
    const user = userEvent.setup()
    render(
      <TreeNode segment="host-name" path={['system', 'host-name']} value="router1" depth={1} />,
    )

    expect(screen.getByText('router1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /edit/i }))
    const input = screen.getByPlaceholderText('router1')
    await user.type(input, 'router2')
    await user.click(screen.getByRole('button', { name: /queue/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['system', 'host-name'], value: 'router2' })
  })

  it('masks a sensitive leaf and labels its edit action "Replace" instead of "Edit"', () => {
    render(
      <TreeNode
        segment="key"
        path={['service', 'https', 'api', 'keys', 'id', 'ui', 'key']}
        value="MY-PLAINTEXT-KEY"
        depth={1}
      />,
    )

    expect(screen.queryByText('MY-PLAINTEXT-KEY')).not.toBeInTheDocument()
    expect(screen.getByText('••••••••')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument()
  })

  it('renders every item of a multi-value array as a distinct row (no duplicate-key collisions)', () => {
    render(
      <TreeNode
        segment="name-server"
        path={['system', 'name-server']}
        value={['1.1.1.1', '9.9.9.9']}
        depth={1}
      />,
    )

    expect(screen.getByText('1.1.1.1')).toBeInTheDocument()
    expect(screen.getByText('9.9.9.9')).toBeInTheDocument()
    // Two array items + the "add value" row worth of Delete/Add
    // buttons; if React ever warned about duplicate keys for this
    // list (the original bug used the bare array index as key),
    // that's a console.error which would already have failed a
    // strict-mode double-render, so getting here at all is part of
    // the regression coverage.
    expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(2)
  })

  it('queues a distinct delete op for each array item', async () => {
    const user = userEvent.setup()
    render(
      <TreeNode
        segment="name-server"
        path={['system', 'name-server']}
        value={['1.1.1.1', '9.9.9.9']}
        depth={1}
      />,
    )

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    await user.click(deleteButtons[0])

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['system', 'name-server'],
      value: '1.1.1.1',
    })
  })

  // Regression test: for a sensitive multi-value leaf, each array item
  // rendered is already the server-masked placeholder ('••••••••'),
  // not the real value. Wiring a per-item Delete button to
  // `queueDelete(item)` would queue {op: 'delete', value: '••••••••'}
  // - the literal placeholder string, which can never match a real
  // VyOS value. Per-item delete must be disabled for a sensitive
  // array; "Clear all values" (delete with no value) is offered
  // instead, which doesn't require identifying the specific item.
  it('disables per-item delete for a sensitive multi-value array, offering "Clear all values" instead', async () => {
    const user = userEvent.setup()
    render(
      <TreeNode
        segment="key"
        path={['service', 'ssh', 'authorized', 'key']}
        value={['AAAA-key-one', 'AAAA-key-two']}
        depth={1}
      />,
    )

    expect(screen.getAllByText('••••••••')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /clear all values/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['service', 'ssh', 'authorized', 'key'],
      value: undefined,
    })
  })

  it('adds a new value to a multi-value array', async () => {
    const user = userEvent.setup()
    render(
      <TreeNode segment="name-server" path={['system', 'name-server']} value={['1.1.1.1']} depth={1} />,
    )

    await user.type(screen.getByPlaceholderText('add value…'), '8.8.8.8')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['system', 'name-server'],
      value: '8.8.8.8',
    })
  })

  // Regression test: AddValueForm used to queue a duplicate `set` op
  // for a value already present in the array with no feedback at all
  // - harmless at commit time (VyOS just no-ops a redundant set), but
  // silently misleading, unlike ChipList.tsx/KeyValuePairList.tsx's
  // own add forms, which already guard against and surface this.
  it('disables Add and shows a message for a value that already exists in the array', async () => {
    const user = userEvent.setup()
    render(
      <TreeNode segment="name-server" path={['system', 'name-server']} value={['1.1.1.1']} depth={1} />,
    )

    await user.type(screen.getByPlaceholderText('add value…'), '1.1.1.1')

    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled()
    expect(screen.getByText(/already added/i)).toBeInTheDocument()
    expect(usePendingChangesStore.getState().changes).toHaveLength(0)
  })

  it('opts freeform edit inputs out of common browser-extension DOM injection', async () => {
    const user = userEvent.setup()
    render(
      <TreeNode segment="host-name" path={['system', 'host-name']} value="router1" depth={1} />,
    )
    await user.click(screen.getByRole('button', { name: /edit/i }))

    const input = screen.getByPlaceholderText('router1')
    // These attributes are the standard opt-outs for password
    // managers/Grammarly that otherwise inject DOM nodes into inputs
    // outside React's control, which can cause
    // "NotFoundError: Failed to execute 'insertBefore' on 'Node'"
    // when React later unmounts/reorders that input. See
    // lib/inputProtection.ts.
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveAttribute('data-1p-ignore')
    expect(input).toHaveAttribute('data-lpignore', 'true')
    expect(input).toHaveAttribute('data-gramm', 'false')
  })

  it('expands and adds a child node under an object', async () => {
    const user = userEvent.setup()
    render(<TreeNode segment="system" path={['system']} value={{ 'host-name': 'router1' }} depth={1} />)

    // depth 1 starts collapsed; expand it before its "+ Add" control is
    // reachable. The button's accessible name includes the ▸/▾
    // collapse-state glyph alongside the segment name.
    await user.click(screen.getByRole('button', { name: /system/ }))
    await user.click(screen.getByRole('button', { name: /\+ add/i }))
    const nameInput = screen.getByPlaceholderText('node name')
    const valueInput = screen.getByPlaceholderText('value (optional)')
    await user.type(nameInput, 'domain-name')
    await user.type(valueInput, 'example.com')

    const addButtons = screen.getAllByRole('button', { name: /^add$/i })
    await user.click(addButtons[addButtons.length - 1])

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['system', 'domain-name'],
      value: 'example.com',
    })
  })

  it('renders a flag (valueless) node with a Remove action', () => {
    render(<TreeNode segment="rest" path={['service', 'https', 'api', 'rest']} value={{}} depth={1} />)
    expect(screen.getByText('rest')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
  })

  describe('revealing a sensitive value', () => {
    const path = ['service', 'https', 'api', 'keys', 'id', 'ui', 'key']

    it('reveals the real value on demand and hides it again', async () => {
      server.use(
        http.post('/api/config/reveal', () => HttpResponse.json({ value: 'MY-PLAINTEXT-KEY' })),
      )
      const user = userEvent.setup()
      render(<TreeNode segment="key" path={path} value="MY-PLAINTEXT-KEY" depth={1} />)

      expect(screen.getByText('••••••••')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /^reveal$/i }))

      expect(await screen.findByText('MY-PLAINTEXT-KEY')).toBeInTheDocument()
      expect(screen.queryByText('••••••••')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /^hide$/i }))
      expect(screen.getByText('••••••••')).toBeInTheDocument()
      expect(screen.queryByText('MY-PLAINTEXT-KEY')).not.toBeInTheDocument()
    })

    it('sends the leaf path in the request body, not a query string', async () => {
      let requestBody: unknown
      server.use(
        http.post('/api/config/reveal', async ({ request }) => {
          requestBody = await request.json()
          return HttpResponse.json({ value: 'MY-PLAINTEXT-KEY' })
        }),
      )
      const user = userEvent.setup()
      render(<TreeNode segment="key" path={path} value="MY-PLAINTEXT-KEY" depth={1} />)
      await user.click(screen.getByRole('button', { name: /^reveal$/i }))

      await waitFor(() => {
        expect(requestBody).toEqual({ path })
      })
    })

    it('shows an error message and stays masked if the reveal request fails', async () => {
      server.use(
        http.post('/api/config/reveal', () =>
          HttpResponse.json({ error: 'not authenticated' }, { status: 401 }),
        ),
      )
      const user = userEvent.setup()
      render(<TreeNode segment="key" path={path} value="MY-PLAINTEXT-KEY" depth={1} />)
      await user.click(screen.getByRole('button', { name: /^reveal$/i }))

      expect(await screen.findByText('not authenticated')).toBeInTheDocument()
      expect(screen.getByText('••••••••')).toBeInTheDocument()
    })

    it('does not offer Reveal for a non-sensitive leaf', () => {
      render(<TreeNode segment="host-name" path={['system', 'host-name']} value="router1" depth={1} />)
      expect(screen.queryByRole('button', { name: /^reveal$/i })).not.toBeInTheDocument()
    })

    it('does not offer Reveal for items of a sensitive multi-value array', () => {
      render(
        <TreeNode
          segment="key"
          path={['service', 'ssh', 'authorized', 'key']}
          value={['AAAA-key-one', 'AAAA-key-two']}
          depth={1}
        />,
      )
      expect(screen.queryByRole('button', { name: /^reveal$/i })).not.toBeInTheDocument()
    })
  })

  it('does not crash rendering a deeply nested tree with mixed node types', () => {
    const tree = {
      system: { 'host-name': 'router1', 'name-server': ['1.1.1.1'] },
      service: { https: { api: { rest: {} } } },
    }
    render(<TreeNode segment={null} path={[]} value={tree} depth={0} />)
    expect(screen.getByText('system')).toBeInTheDocument()
  })
})
