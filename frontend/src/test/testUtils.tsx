import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

/** A fresh, retry-disabled QueryClient per call, so tests don't share
 * cache state or wait through React Query's default retry/backoff. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

/** Renders a component wrapped with the same providers main.tsx wires
 * up in the real app (QueryClientProvider, MemoryRouter), for
 * components that use react-query hooks and/or routing but don't need
 * to test the full app shell. */
export function renderWithProviders(
  ui: ReactElement,
  options: { queryClient?: QueryClient; route?: string } & Omit<RenderOptions, 'wrapper'> = {},
) {
  const { queryClient = createTestQueryClient(), route = '/', ...renderOptions } = options

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...renderOptions }) }
}
