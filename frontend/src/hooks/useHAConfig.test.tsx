import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { server } from '../test/mocks/server'
import { createTestQueryClient } from '../test/testUtils'
import { useHAConfig } from './useHAConfig'

// Regression tests for the code review finding that useHAConfig (and
// useInterfaceConfig.ts/useOSPFConfig.ts, which fetch two config-tree
// roots the same way) only exposed isLoading/isError, unlike every
// other config hook in this directory, which spreads its single
// useQuery result and so gets error/isFetching/refetch "for free".
// These specifically target the fields no consuming page happens to
// use today, so no existing page test would catch a regression here.
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
}

describe('useHAConfig', () => {
  it('surfaces a query error via the error field', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))

    const { result } = renderHook(() => useHAConfig(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeTruthy()
  })

  it('refetch() re-runs both underlying queries', async () => {
    let haCallCount = 0
    server.use(
      http.get('/api/config/tree', ({ request }) => {
        const path = new URL(request.url).searchParams.get('path')
        if (path === 'high-availability') haCallCount++
        return HttpResponse.json({ data: {} })
      }),
    )

    const { result } = renderHook(() => useHAConfig(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(haCallCount).toBe(1)

    await result.current.refetch()
    expect(haCallCount).toBe(2)
  })
})
