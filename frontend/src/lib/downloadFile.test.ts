import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadTextFile, exportTimestamp } from './downloadFile'

describe('downloadTextFile', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url')
    revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
    clickSpy = vi.fn()
    HTMLAnchorElement.prototype.click = clickSpy as unknown as () => void
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates an object URL, clicks a download link with the right filename, and revokes it', () => {
    downloadTextFile('test.txt', 'hello world')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blobArg = createObjectURL.mock.calls[0][0] as Blob
    expect(blobArg.type).toBe('text/plain')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('supports a custom mime type', () => {
    downloadTextFile('test.json', '{}', 'application/json')
    const blobArg = createObjectURL.mock.calls[0][0] as Blob
    expect(blobArg.type).toBe('application/json')
  })
})

describe('exportTimestamp', () => {
  it('formats a date without colons or milliseconds', () => {
    const date = new Date('2026-08-27T14:30:05.123Z')
    expect(exportTimestamp(date)).toBe('2026-08-27T14-30-05')
  })
})
