import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/mocks/server'
import { renderWithProviders } from '../test/testUtils'
import FilesPage from './FilesPage'

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url') as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn()
  HTMLAnchorElement.prototype.click = vi.fn()

  server.use(http.get('/api/files/roots', () => HttpResponse.json({ roots: ['/config', '/var/log'] })))
})

describe('FilesPage', () => {
  it('shows an error when the roots list fails to load', async () => {
    server.use(http.get('/api/files/roots', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<FilesPage />)
    expect(await screen.findByText(/failed to load the list of browsable directories/i)).toBeInTheDocument()
  })

  it('lists the first root directory by default', async () => {
    server.use(
      http.get('/api/files', ({ request }) => {
        expect(new URL(request.url).searchParams.get('path')).toBe('/config')
        return HttpResponse.json({
          path: '/config',
          isDirectory: true,
          entries: [
            { name: 'scripts', isDir: true, permissions: 'drwxr-xr-x', size: '4.0K', modified: 'Jan  1 00:00' },
            { name: 'config.boot', isDir: false, permissions: 'rw-r--r--', size: '123', modified: 'Jan  1 00:00' },
          ],
        })
      }),
    )
    renderWithProviders(<FilesPage />)
    expect(await screen.findByText('config.boot')).toBeInTheDocument()
    expect(screen.getByText('scripts/')).toBeInTheDocument()
  })

  it('shows a placeholder for an empty directory', async () => {
    server.use(
      http.get('/api/files', () => HttpResponse.json({ path: '/config', isDirectory: true, entries: [] })),
    )
    renderWithProviders(<FilesPage />)
    expect(await screen.findByText('This directory is empty.')).toBeInTheDocument()
  })

  it('navigates into a subdirectory when a directory row is clicked', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/files', ({ request }) => {
        const path = new URL(request.url).searchParams.get('path')
        if (path === '/config/scripts') {
          return HttpResponse.json({
            path: '/config/scripts',
            isDirectory: true,
            entries: [{ name: 'backup.sh', isDir: false, permissions: 'rwxr-xr-x', size: '456', modified: 'Jan 2' }],
          })
        }
        return HttpResponse.json({
          path: '/config',
          isDirectory: true,
          entries: [{ name: 'scripts', isDir: true, permissions: 'drwxr-xr-x', size: '4.0K', modified: 'Jan  1' }],
        })
      }),
    )
    renderWithProviders(<FilesPage />)
    await user.click(await screen.findByText('scripts/'))
    expect(await screen.findByText('backup.sh')).toBeInTheDocument()
  })

  it('shows file content, metadata, and lets the breadcrumb navigate back up', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/files', ({ request }) => {
        const path = new URL(request.url).searchParams.get('path')
        if (path === '/config/config.boot') {
          return HttpResponse.json({
            path: '/config/config.boot',
            isDirectory: false,
            type: 'ASCII text',
            owner: 'root:vyattacfg',
            permissions: 'rw-r--r--',
            modified: '2024-01-01 12:00:00',
            isBinary: false,
            content: "set system host-name 'vyos'\n",
          })
        }
        return HttpResponse.json({
          path: '/config',
          isDirectory: true,
          entries: [
            { name: 'config.boot', isDir: false, permissions: 'rw-r--r--', size: '123', modified: 'Jan  1' },
          ],
        })
      }),
    )
    renderWithProviders(<FilesPage />)
    await user.click(await screen.findByText('config.boot'))

    expect(await screen.findByText(/ASCII text/)).toBeInTheDocument()
    expect(screen.getByText(/set system host-name/)).toBeInTheDocument()

    // Breadcrumb: "config" (ancestor) should navigate back to the directory.
    await user.click(screen.getByRole('button', { name: 'config' }))
    expect(await screen.findByText('config.boot')).toBeInTheDocument()
  })

  it('shows a binary-file note and a hex dump instead of raw content', async () => {
    server.use(
      http.get('/api/files', () =>
        HttpResponse.json({
          path: '/config/some.bin',
          isDirectory: false,
          type: 'data',
          isBinary: true,
          content: '00000000  23 21 2f 62 69 6e 2f 62  61 73 68 0a  |#!/bin/bash.|',
        }),
      ),
    )
    renderWithProviders(<FilesPage />)
    expect(await screen.findByText(/binary file/i)).toBeInTheDocument()
    expect(screen.getByText(/23 21 2f 62/)).toBeInTheDocument()
  })

  it('shows a truncation note when the content was cut short', async () => {
    server.use(
      http.get('/api/files', () =>
        HttpResponse.json({
          path: '/config/huge.txt',
          isDirectory: false,
          type: 'ASCII text',
          content: 'x'.repeat(100),
          truncated: true,
        }),
      ),
    )
    renderWithProviders(<FilesPage />)
    expect(await screen.findByText(/content truncated/i)).toBeInTheDocument()
  })

  it('downloads the current file content when Download is clicked', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/files', () =>
        HttpResponse.json({
          path: '/config/config.boot',
          isDirectory: false,
          type: 'ASCII text',
          content: "set system host-name 'vyos'\n",
        }),
      ),
    )
    renderWithProviders(<FilesPage />)
    await user.click(await screen.findByRole('button', { name: 'Download' }))
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
  })

  it('switches to the /var/log root when its tab is clicked', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/files', ({ request }) => {
        const path = new URL(request.url).searchParams.get('path')
        return HttpResponse.json({
          path,
          isDirectory: true,
          entries: path === '/var/log' ? [{ name: 'messages', isDir: false, permissions: 'rw-r--r--', size: '1K', modified: 'Jan 1' }] : [],
        })
      }),
    )
    renderWithProviders(<FilesPage />)
    await screen.findByText('This directory is empty.')

    await user.click(screen.getByRole('button', { name: '/var/log' }))
    expect(await screen.findByText('messages')).toBeInTheDocument()
  })

  it('shows an error message when a directory/file fetch fails', async () => {
    server.use(http.get('/api/files', () => HttpResponse.json({ error: 'not found' }, { status: 502 })))
    renderWithProviders(<FilesPage />)
    expect(await screen.findByText(/failed to load \/config/i)).toBeInTheDocument()
  })
})
