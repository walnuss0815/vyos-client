import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../test/mocks/server'
import { renderWithProviders } from '../test/testUtils'
import { useSessionStore } from '../store/session'
import Layout, { DEFAULT_DOCUMENT_TITLE } from './Layout'

beforeEach(() => {
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

afterEach(() => {
  document.title = ''
})

describe('Layout', () => {
  it('sets the document title to the default while the hostname is loading', () => {
    server.use(http.get('/api/system/info', () => new Promise(() => {})))
    renderWithProviders(<Layout />)
    expect(document.title).toBe(DEFAULT_DOCUMENT_TITLE)
  })

  it("sets the document title to the router's hostname once it loads", async () => {
    server.use(
      http.get('/api/system/info', () => HttpResponse.json({ hostname: 'my-router', version: '1.5' })),
    )
    renderWithProviders(<Layout />)
    await waitFor(() => {
      expect(document.title).toBe('my-router')
    })
  })

  it('falls back to the default title if the hostname query fails', async () => {
    server.use(
      http.get('/api/system/info', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })),
    )
    renderWithProviders(<Layout />)
    // Give the (failed) query a tick to settle, then confirm we never
    // ended up with something like "[object Object]" or "undefined".
    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })
    expect(document.title).toBe(DEFAULT_DOCUMENT_TITLE)
  })

  it('labels the routing nav item "Routing", not "Routes"', () => {
    renderWithProviders(<Layout />)
    expect(screen.getByRole('link', { name: 'Routing' })).toHaveAttribute('href', '/routes')
    expect(screen.queryByRole('link', { name: 'Routes' })).not.toBeInTheDocument()
  })

  it("shows the router's hostname in the sidebar header once loaded", async () => {
    server.use(
      http.get('/api/system/info', () => HttpResponse.json({ hostname: 'my-router', version: '1.5' })),
    )
    renderWithProviders(<Layout />)
    // Appears twice: once in the always-present sidebar header, once
    // in the mobile-only top bar (hidden via CSS at lg: and up, but
    // still present in the DOM in jsdom, which doesn't evaluate media
    // queries) - see Layout.tsx's off-canvas sidebar.
    expect(await screen.findAllByText('my-router')).toHaveLength(2)
    // No leftover lowercase static label from before the hostname was
    // shown here - distinct from the deliberate "VyOS Client" brand
    // eyebrow asserted below, which is a small permanent label above
    // the hostname, not a hostname replacement.
    expect(screen.queryByText('vyos-client')).not.toBeInTheDocument()
  })

  it('shows a permanent "VyOS Client" brand label in the sidebar header, regardless of hostname load state', async () => {
    server.use(
      http.get('/api/system/info', () => HttpResponse.json({ hostname: 'my-router', version: '1.5' })),
    )
    renderWithProviders(<Layout />)
    await screen.findAllByText('my-router')
    expect(screen.getByText('VyOS Client')).toBeInTheDocument()
  })

  it('shows the default title in the sidebar header while loading', () => {
    server.use(http.get('/api/system/info', () => new Promise(() => {})))
    renderWithProviders(<Layout />)
    // The mobile top bar's hostname-or-fallback span, plus the
    // sidebar's own hostname-or-fallback span, plus the sidebar's
    // permanent "VyOS Client" brand eyebrow (always literally
    // DEFAULT_DOCUMENT_TITLE's own text) - three, not two.
    expect(screen.getAllByText(DEFAULT_DOCUMENT_TITLE)).toHaveLength(3)
  })

  it('shows the theme toggle in the sidebar header', () => {
    renderWithProviders(<Layout />)
    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument()
  })

  it('links to the GitHub repo in the sidebar footer', () => {
    renderWithProviders(<Layout />)
    const link = screen.getByRole('link', { name: /view source on github/i })
    expect(link).toHaveAttribute('href', 'https://github.com/walnuss0815/vyos-client')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  describe('Ingress nav group', () => {
    it('is absent when ingressEnabled is false (the default)', async () => {
      renderWithProviders(<Layout />)
      await screen.findByText('admin')
      expect(screen.queryByText('Ingress')).not.toBeInTheDocument()
    })

    it('shows configured entries as new-tab links, plus a Manage link, when enabled', async () => {
      server.use(
        http.get('/api/system/info', () =>
          HttpResponse.json({ hostname: 'test-router', version: '1.5', loginBanner: '', ingressEnabled: true }),
        ),
        http.get('/api/ingress', () =>
          HttpResponse.json({
            entries: [
              { name: 'nas', targetUrl: 'http://10.0.0.5', headers: [], skipTlsVerify: false },
              { name: 'switch', targetUrl: 'http://10.0.0.6', headers: [], skipTlsVerify: false },
            ],
          }),
        ),
      )
      renderWithProviders(<Layout />)

      expect(await screen.findByText('Ingress')).toBeInTheDocument()
      const nasLink = await screen.findByRole('link', { name: /nas/i })
      expect(nasLink).toHaveAttribute('href', '/ingress/nas/')
      expect(nasLink).toHaveAttribute('target', '_blank')
      expect(nasLink).toHaveAttribute('rel', 'noreferrer')
      expect(screen.getByRole('link', { name: /switch/i })).toHaveAttribute('href', '/ingress/switch/')
      expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/ingresses')
    })

    it('shows a placeholder message when enabled but no entries are configured yet', async () => {
      server.use(
        http.get('/api/system/info', () =>
          HttpResponse.json({ hostname: 'test-router', version: '1.5', loginBanner: '', ingressEnabled: true }),
        ),
        http.get('/api/ingress', () => HttpResponse.json({ entries: [] })),
      )
      renderWithProviders(<Layout />)

      expect(await screen.findByText('No ingresses configured yet.')).toBeInTheDocument()
    })

    it('does not fetch the ingress list at all when ingressEnabled is false', async () => {
      let requested = false
      server.use(
        http.get('/api/ingress', () => {
          requested = true
          return HttpResponse.json({ entries: [] })
        }),
      )
      renderWithProviders(<Layout />)
      await screen.findByText('admin')
      // Give any stray request a moment to have shown up if it were
      // going to.
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(requested).toBe(false)
    })
  })

  describe('off-canvas sidebar (below the lg: breakpoint)', () => {
    it('has no backdrop until the hamburger button is clicked', () => {
      renderWithProviders(<Layout />)
      expect(document.querySelector('[aria-hidden="true"].bg-black\\/60')).not.toBeInTheDocument()
    })

    it('shows a backdrop after opening the drawer', async () => {
      const user = userEvent.setup()
      renderWithProviders(<Layout />)

      await user.click(screen.getByRole('button', { name: 'Open menu' }))

      expect(document.querySelector('[aria-hidden="true"].bg-black\\/60')).toBeInTheDocument()
    })

    it('closes the drawer when the backdrop is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<Layout />)

      await user.click(screen.getByRole('button', { name: 'Open menu' }))
      const backdrop = document.querySelector('[aria-hidden="true"].bg-black\\/60')
      if (!backdrop) throw new Error('backdrop not found')
      await user.click(backdrop)

      expect(document.querySelector('[aria-hidden="true"].bg-black\\/60')).not.toBeInTheDocument()
    })

    it('closes the drawer after navigating to a different page', async () => {
      const user = userEvent.setup()
      renderWithProviders(<Layout />)

      await user.click(screen.getByRole('button', { name: 'Open menu' }))
      expect(document.querySelector('[aria-hidden="true"].bg-black\\/60')).toBeInTheDocument()

      await user.click(screen.getByRole('link', { name: 'Firewall' }))

      expect(document.querySelector('[aria-hidden="true"].bg-black\\/60')).not.toBeInTheDocument()
    })
  })
})
