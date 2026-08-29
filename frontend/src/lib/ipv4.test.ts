import { describe, expect, it } from 'vitest'
import { ipv4RangeSize, ipv4ToInt, isIpv4InRange, isValidIpv4 } from './ipv4'

describe('ipv4ToInt', () => {
  it('parses a valid address', () => {
    expect(ipv4ToInt('0.0.0.0')).toBe(0)
    expect(ipv4ToInt('0.0.0.1')).toBe(1)
    expect(ipv4ToInt('0.0.1.0')).toBe(256)
    expect(ipv4ToInt('255.255.255.255')).toBe(4294967295)
    expect(ipv4ToInt('192.168.1.50')).toBe(3232235826)
  })

  it('trims surrounding whitespace', () => {
    expect(ipv4ToInt('  192.168.1.1  ')).toBe(ipv4ToInt('192.168.1.1'))
  })

  it('returns undefined for malformed input', () => {
    expect(ipv4ToInt('not-an-ip')).toBeUndefined()
    expect(ipv4ToInt('192.168.1')).toBeUndefined()
    expect(ipv4ToInt('192.168.1.1.1')).toBeUndefined()
    expect(ipv4ToInt('192.168.1.256')).toBeUndefined()
    expect(ipv4ToInt('192.168.1.-1')).toBeUndefined()
    expect(ipv4ToInt('')).toBeUndefined()
    expect(ipv4ToInt('2001:db8::1')).toBeUndefined()
  })
})

describe('ipv4RangeSize', () => {
  it('counts addresses inclusively', () => {
    expect(ipv4RangeSize('192.168.1.50', '192.168.1.50')).toBe(1)
    expect(ipv4RangeSize('192.168.1.50', '192.168.1.250')).toBe(201)
    expect(ipv4RangeSize('192.168.1.1', '192.168.2.0')).toBe(256)
  })

  it('returns 0 when stop is before start', () => {
    expect(ipv4RangeSize('192.168.1.250', '192.168.1.50')).toBe(0)
  })

  it('returns 0 when either bound is malformed', () => {
    expect(ipv4RangeSize('not-an-ip', '192.168.1.50')).toBe(0)
    expect(ipv4RangeSize('192.168.1.50', 'not-an-ip')).toBe(0)
  })
})

describe('isValidIpv4', () => {
  it('is true for a well-formed address', () => {
    expect(isValidIpv4('192.168.1.50')).toBe(true)
    expect(isValidIpv4('0.0.0.0')).toBe(true)
    expect(isValidIpv4('255.255.255.255')).toBe(true)
  })

  it('is false for malformed input', () => {
    expect(isValidIpv4('not-an-ip')).toBe(false)
    expect(isValidIpv4('192.168.1')).toBe(false)
    expect(isValidIpv4('192.168.1.256')).toBe(false)
    expect(isValidIpv4('192.168.1.0/24')).toBe(false)
    expect(isValidIpv4('')).toBe(false)
  })
})

describe('isIpv4InRange', () => {
  it('is true for an address within the bounds, inclusive', () => {
    expect(isIpv4InRange('192.168.1.50', '192.168.1.50', '192.168.1.100')).toBe(true)
    expect(isIpv4InRange('192.168.1.100', '192.168.1.50', '192.168.1.100')).toBe(true)
    expect(isIpv4InRange('192.168.1.75', '192.168.1.50', '192.168.1.100')).toBe(true)
  })

  it('is false for an address outside the bounds', () => {
    expect(isIpv4InRange('192.168.1.49', '192.168.1.50', '192.168.1.100')).toBe(false)
    expect(isIpv4InRange('192.168.1.101', '192.168.1.50', '192.168.1.100')).toBe(false)
  })

  it('is false when any argument fails to parse', () => {
    expect(isIpv4InRange('not-an-ip', '192.168.1.50', '192.168.1.100')).toBe(false)
    expect(isIpv4InRange('192.168.1.75', 'not-an-ip', '192.168.1.100')).toBe(false)
    expect(isIpv4InRange('192.168.1.75', '192.168.1.50', 'not-an-ip')).toBe(false)
  })
})
