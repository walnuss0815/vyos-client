import { describe, expect, it } from 'vitest'
import { asArray, asString, asStringArray, child, isFlagPresent, isRecord } from './configTree'

describe('isRecord', () => {
  it('accepts plain objects only', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
    expect(isRecord(undefined)).toBe(false)
    expect(isRecord('x')).toBe(false)
    expect(isRecord(1)).toBe(false)
  })
})

describe('asString', () => {
  it('stringifies scalars, keeping an absent leaf undefined', () => {
    expect(asString('a')).toBe('a')
    expect(asString('')).toBe('')
    expect(asString(0)).toBe('0')
    expect(asString(false)).toBe('false')
    expect(asString(undefined)).toBeUndefined()
    expect(asString(null)).toBeUndefined()
  })
})

describe('asArray', () => {
  it('normalizes a leaf of any shape into a string array', () => {
    expect(asArray(undefined)).toEqual([])
    expect(asArray(null)).toEqual([])
    expect(asArray('a')).toEqual(['a'])
    expect(asArray(5)).toEqual(['5'])
    expect(asArray(['a', 2])).toEqual(['a', '2'])
    expect(asArray([])).toEqual([])
  })
})

describe('asStringArray', () => {
  it('wraps a bare string and treats other non-arrays as absent', () => {
    expect(asStringArray('a')).toEqual(['a'])
    expect(asStringArray(['a', 2])).toEqual(['a', '2'])
    expect(asStringArray(5)).toEqual([])
    expect(asStringArray({})).toEqual([])
    expect(asStringArray(undefined)).toEqual([])
    expect(asStringArray(null)).toEqual([])
  })
})

describe('child', () => {
  it('reads a key from an object and is undefined for anything else', () => {
    expect(child({ a: 'x' }, 'a')).toBe('x')
    expect(child({ a: 'x' }, 'b')).toBeUndefined()
    expect(child(['x'], '0')).toBeUndefined()
    expect(child(null, 'a')).toBeUndefined()
    expect(child('str', 'length')).toBeUndefined()
  })
})

describe('isFlagPresent', () => {
  it('is true for a present key, even with an empty value', () => {
    expect(isFlagPresent({ disable: {} }, 'disable')).toBe(true)
    expect(isFlagPresent({ disable: '' }, 'disable')).toBe(true)
    expect(isFlagPresent({}, 'disable')).toBe(false)
    expect(isFlagPresent(undefined, 'disable')).toBe(false)
    expect(isFlagPresent(['disable'], 'disable')).toBe(false)
  })
})
