import { describe, expect, it } from 'vitest'
import { MASK_PLACEHOLDER, isSensitiveLeaf, isSensitivePath, maskValue } from './masking'

describe('isSensitiveLeaf', () => {
  it('matches known sensitive leaf names, case-insensitively', () => {
    expect(isSensitiveLeaf('password')).toBe(true)
    expect(isSensitiveLeaf('Password')).toBe(true)
    expect(isSensitiveLeaf('plaintext-password')).toBe(true)
    expect(isSensitiveLeaf('pre-shared-key')).toBe(true)
    expect(isSensitiveLeaf('community')).toBe(true)
  })

  it('normalizes underscores to hyphens', () => {
    expect(isSensitiveLeaf('plaintext_password')).toBe(true)
  })

  it('does not match ordinary leaf names', () => {
    expect(isSensitiveLeaf('host-name')).toBe(false)
    expect(isSensitiveLeaf('address')).toBe(false)
    expect(isSensitiveLeaf('description')).toBe(false)
  })
})

describe('isSensitivePath', () => {
  it('checks only the last path segment', () => {
    expect(isSensitivePath(['service', 'https', 'api', 'keys', 'id', 'ui', 'key'])).toBe(true)
    expect(isSensitivePath(['system', 'host-name'])).toBe(false)
  })

  it('returns false for an empty path', () => {
    expect(isSensitivePath([])).toBe(false)
  })
})

describe('maskValue', () => {
  it('masks sensitive values', () => {
    expect(maskValue(['system', 'login', 'user', 'x', 'authentication', 'plaintext-password'], 'hunter2')).toBe(
      MASK_PLACEHOLDER,
    )
  })

  it('leaves non-sensitive values unchanged', () => {
    expect(maskValue(['system', 'host-name'], 'router1')).toBe('router1')
  })
})
