import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import SystemLayout from './SystemLayout'

beforeEach(() => {
  sessionStorage.clear()
})

describe('SystemLayout', () => {
  it('always renders the Upgrades tab, annotated as off when self-upgrade is disabled', async () => {
    server.use(
      http.get('/api/system/info', () =>
        HttpResponse.json({
          hostname: 'test-router',
          version: '1.2.0',
          loginBanner: '',
          configWarningsEnabled: false,
          selfUpgradeEnabled: false,
        }),
      ),
    )
    const { queryClient } = renderWithProviders(<SystemLayout />)

    expect(await screen.findByRole('link', { name: /upgrades/i })).toBeInTheDocument()
    // Wait for the underlying system-info fetch to actually resolve
    // before asserting the annotation - otherwise this would trivially
    // pass on the pre-data-loaded render too (systemInfo undefined
    // also renders without "(off)").
    await waitFor(() => {
      expect(queryClient.getQueryState(['system-info'])?.status).toBe('success')
    })
    expect(screen.getByRole('link', { name: /upgrades/i })).toHaveTextContent('(off)')
  })

  it('does not annotate the Upgrades tab when self-upgrade is enabled', async () => {
    server.use(
      http.get('/api/system/info', () =>
        HttpResponse.json({
          hostname: 'test-router',
          version: '1.2.0',
          loginBanner: '',
          configWarningsEnabled: false,
          selfUpgradeEnabled: true,
        }),
      ),
    )
    const { queryClient } = renderWithProviders(<SystemLayout />)

    await waitFor(() => {
      expect(queryClient.getQueryState(['system-info'])?.status).toBe('success')
    })
    expect(screen.getByRole('link', { name: /upgrades/i })).not.toHaveTextContent('(off)')
  })
})
