import { describe, expect, it } from 'vitest'
import { formatBytes } from './formatBytes'

describe('formatBytes', () => {
  it('shows whole bytes with no decimal places', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('scales up to KB/MB/GB/TB with 2 decimal places', () => {
    expect(formatBytes(1536)).toBe('1.50 KB')
    expect(formatBytes(1024 * 1024 * 1.25)).toBe('1.25 MB')
    expect(formatBytes(1024 ** 3 * 15.32)).toBe('15.32 GB')
    expect(formatBytes(1024 ** 4 * 2)).toBe('2.00 TB')
  })

  it('caps at TB rather than continuing to a larger unit', () => {
    expect(formatBytes(1024 ** 5)).toBe('1024.00 TB')
  })

  it('returns "0 B" for zero, negative, or non-finite input', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-100)).toBe('0 B')
    expect(formatBytes(NaN)).toBe('0 B')
    expect(formatBytes(Infinity)).toBe('0 B')
  })
})
