import { describe, expect, it } from 'vitest'
import { MASK_PLACEHOLDER, isMaskedPath, isSensitiveIdentifier, isSensitiveLeaf, isSensitivePath, maskValue } from './masking'

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

describe('isSensitiveIdentifier', () => {
  it('matches a substring of a compound tag-node identifier, case-insensitively', () => {
    expect(isSensitiveIdentifier('DB_PASSWORD')).toBe(true)
    expect(isSensitiveIdentifier('db-password')).toBe(true)
    expect(isSensitiveIdentifier('STRIPE_API_KEY')).toBe(true)
    expect(isSensitiveIdentifier('SESSION_SECRET')).toBe(true)
  })

  it('does not match ordinary identifiers', () => {
    expect(isSensitiveIdentifier('TZ')).toBe(false)
    expect(isSensitiveIdentifier('NODE_ENV')).toBe(false)
    expect(isSensitiveIdentifier('PORT')).toBe(false)
  })
})

describe('isMaskedPath', () => {
  it('still matches an exact sensitive leaf name', () => {
    expect(isMaskedPath(['system', 'login', 'user', 'x', 'authentication', 'plaintext-password'])).toBe(true)
    expect(isMaskedPath(['system', 'host-name'])).toBe(false)
  })

  it('matches a generic "value" leaf whose tag-node identifier looks sensitive', () => {
    expect(isMaskedPath(['container', 'name', 'web', 'environment', 'DB_PASSWORD', 'value'])).toBe(true)
  })

  it('does not match a generic "value" leaf whose identifier does not look sensitive', () => {
    expect(isMaskedPath(['container', 'name', 'web', 'environment', 'TZ', 'value'])).toBe(false)
  })

  it('only checks the immediate second-to-last segment, not any ancestor further up', () => {
    expect(isMaskedPath(['container', 'name', 'my-secret-app', 'environment', 'TZ', 'value'])).toBe(false)
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

  it('masks a sensitive-looking environment variable value', () => {
    expect(maskValue(['container', 'name', 'web', 'environment', 'DB_PASSWORD', 'value'], 'hunter2')).toBe(
      MASK_PLACEHOLDER,
    )
  })

  it('leaves a non-sensitive-looking environment variable value unchanged', () => {
    expect(maskValue(['container', 'name', 'web', 'environment', 'TZ', 'value'], 'UTC')).toBe('UTC')
  })
})
