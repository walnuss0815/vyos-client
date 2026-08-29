import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../test/mocks/server'
import { renderWithProviders } from '../test/testUtils'
import ImportConfigPanel from './ImportConfigPanel'

function makeFile(content: string, name = 'config.txt') {
  return new File([content], name, { type: 'text/plain' })
}

beforeEach(() => {
  server.use(http.post('/api/config/import', () => HttpResponse.json({ pendingConfirm: false })))
})

describe('ImportConfigPanel', () => {
  it('disables the import button until a file is chosen', () => {
    renderWithProviders(<ImportConfigPanel />)
    expect(screen.getByRole('button', { name: /import configuration/i })).toBeDisabled()
  })

  it('imports a merge by default once a file is chosen', async () => {
    const user = userEvent.setup()
    let receivedBody: unknown
    server.use(
      http.post('/api/config/import', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ pendingConfirm: false })
      }),
    )
    renderWithProviders(<ImportConfigPanel />)

    const input = screen.getByLabelText(/configuration file/i)
    await user.upload(input, makeFile("set system host-name 'r1'\n"))

    const importButton = screen.getByRole('button', { name: /import configuration/i })
    await waitFor(() => expect(importButton).not.toBeDisabled())
    await user.click(importButton)

    expect(await screen.findByText(/imported successfully/i)).toBeInTheDocument()
    expect(receivedBody).toMatchObject({ mode: 'merge', content: "set system host-name 'r1'\n" })
  })

  it('requires acknowledgment before a full-replace (load) import is enabled', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportConfigPanel />)

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile('interfaces {\n}\n'))
    await user.click(screen.getByRole('radio', { name: /full replace/i }))

    const importButton = screen.getByRole('button', { name: /import configuration/i })
    expect(importButton).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: /i understand this may lock me out/i }))
    expect(importButton).not.toBeDisabled()
  })

  it('sends mode=load once acknowledged', async () => {
    const user = userEvent.setup()
    let receivedBody: unknown
    server.use(
      http.post('/api/config/import', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ pendingConfirm: false })
      }),
    )
    renderWithProviders(<ImportConfigPanel />)

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile('interfaces {\n}\n'))
    await user.click(screen.getByRole('radio', { name: /full replace/i }))
    await user.click(screen.getByRole('checkbox', { name: /i understand this may lock me out/i }))
    await user.click(screen.getByRole('button', { name: /import configuration/i }))

    expect(await screen.findByText(/imported successfully/i)).toBeInTheDocument()
    expect(receivedBody).toMatchObject({ mode: 'load' })
  })

  it('resets the load acknowledgment when switching back to merge', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportConfigPanel />)

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile('interfaces {\n}\n'))
    await user.click(screen.getByRole('radio', { name: /full replace/i }))
    await user.click(screen.getByRole('checkbox', { name: /i understand this may lock me out/i }))
    await user.click(screen.getByRole('radio', { name: /^merge/i }))
    await user.click(screen.getByRole('radio', { name: /full replace/i }))

    expect(screen.getByRole('checkbox', { name: /i understand this may lock me out/i })).not.toBeChecked()
  })

  it('shows a "Keep changes?" banner when the import starts a commit-confirm timer', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/config/import', () => HttpResponse.json({ pendingConfirm: true })),
      http.post('/api/config/commit/confirm', () => new HttpResponse(null, { status: 204 })),
    )
    renderWithProviders(<ImportConfigPanel />)

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile('interfaces {\n}\n'))
    await user.click(screen.getByRole('button', { name: /import configuration/i }))

    expect(await screen.findByText(/keep this imported configuration/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /keep changes/i }))

    expect(await screen.findByText(/imported successfully/i)).toBeInTheDocument()
  })

  it('shows an error message when the import fails', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/config/import', () => HttpResponse.json({ error: 'malformed config' }, { status: 422 })))
    renderWithProviders(<ImportConfigPanel />)

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile('bogus'))
    await user.click(screen.getByRole('button', { name: /import configuration/i }))

    expect(await screen.findByText(/malformed config/i)).toBeInTheDocument()
  })

  it('disables import when safe-apply seconds are out of range', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportConfigPanel />)

    await user.upload(screen.getByLabelText(/configuration file/i), makeFile('interfaces {\n}\n'))
    const secondsInput = screen.getByDisplayValue('90')
    await user.clear(secondsInput)
    await user.type(secondsInput, '5')

    expect(screen.getByRole('button', { name: /import configuration/i })).toBeDisabled()
    expect(screen.getByText(/must be between/i)).toBeInTheDocument()
  })
})
