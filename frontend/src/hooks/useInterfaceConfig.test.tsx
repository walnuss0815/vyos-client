import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { server } from '../test/mocks/server'
import { createTestQueryClient } from '../test/testUtils'
import { useInterfaceConfig } from './useInterfaceConfig'

// See useHAConfig.test.tsx's doc comment - same fix, same shape of
// regression test, for the other of the three hooks that fetch two
// config-tree roots.
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
}

describe('useInterfaceConfig', () => {
  it('surfaces a query error via the error field', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))

    const { result } = renderHook(() => useInterfaceConfig(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeTruthy()
  })

  it('refetch() re-runs both underlying queries', async () => {
    let interfacesCallCount = 0
    server.use(
      http.get('/api/config/tree', ({ request }) => {
        const path = new URL(request.url).searchParams.get('path')
        if (path === 'interfaces') interfacesCallCount++
        return HttpResponse.json({ data: {} })
      }),
    )

    const { result } = renderHook(() => useInterfaceConfig(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(interfacesCallCount).toBe(1)

    await result.current.refetch()
    expect(interfacesCallCount).toBe(2)
  })
})
