import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { server } from '../test/mocks/server'
import { createTestQueryClient } from '../test/testUtils'
import { useOSPFConfig } from './useOSPFConfig'

// See useHAConfig.test.tsx's doc comment - same fix, same shape of
// regression test, for the last of the three hooks that fetch two
// config-tree roots.
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
}

describe('useOSPFConfig', () => {
  it('surfaces a query error via the error field', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))

    const { result } = renderHook(() => useOSPFConfig(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeTruthy()
  })

  it('refetch() re-runs both underlying queries', async () => {
    let ospfCallCount = 0
    server.use(
      http.get('/api/config/tree', ({ request }) => {
        const path = new URL(request.url).searchParams.get('path')
        if (path === 'protocols,ospf') ospfCallCount++
        return HttpResponse.json({ data: {} })
      }),
    )

    const { result } = renderHook(() => useOSPFConfig(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(ospfCallCount).toBe(1)

    await result.current.refetch()
    expect(ospfCallCount).toBe(2)
  })
})
