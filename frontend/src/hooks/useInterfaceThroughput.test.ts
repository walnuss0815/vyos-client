import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { NetworkInterface } from '../lib/vyosApi'
import { useInterfaceThroughput } from './useInterfaceThroughput'

function iface(name: string, rxBytes: number, txBytes: number): NetworkInterface {
  return {
    name,
    mtu: 1500,
    operState: 'up',
    adminState: 'up',
    addresses: [],
    rxBytes,
    txBytes,
  }
}

describe('useInterfaceThroughput', () => {
  it('produces no samples on the very first poll (nothing to diff against yet)', () => {
    const { result } = renderHook(() =>
      useInterfaceThroughput([iface('eth0', 1000, 2000)], 1000, 'eth0'),
    )
    expect(result.current).toEqual([])
  })

  it('computes bytes/sec from two successive polls', () => {
    const { result, rerender } = renderHook(
      ({ interfaces, t }: { interfaces: NetworkInterface[]; t: number }) =>
        useInterfaceThroughput(interfaces, t, 'eth0'),
      { initialProps: { interfaces: [iface('eth0', 1000, 2000)], t: 1000 } },
    )
    // 5 seconds later, +5000 rx bytes and +20000 tx bytes -> 1000 B/s and 4000 B/s.
    rerender({ interfaces: [iface('eth0', 6000, 22000)], t: 6000 })

    expect(result.current).toEqual([{ t: 6000, rxBps: 1000, txBps: 4000 }])
  })

  it('clamps a negative delta (counter reset, e.g. interface flap) to 0 instead of a huge/negative spike', () => {
    const { result, rerender } = renderHook(
      ({ interfaces, t }: { interfaces: NetworkInterface[]; t: number }) =>
        useInterfaceThroughput(interfaces, t, 'eth0'),
      { initialProps: { interfaces: [iface('eth0', 500_000, 500_000)], t: 1000 } },
    )
    // Counters reset back down to near-zero, as if the interface flapped.
    rerender({ interfaces: [iface('eth0', 100, 100)], t: 2000 })

    expect(result.current).toEqual([{ t: 2000, rxBps: 0, txBps: 0 }])
  })

  it('clears history and starts a fresh baseline when the selected interface changes', () => {
    const interfaces = [iface('eth0', 1000, 1000), iface('eth1', 50_000, 60_000)]
    const { result, rerender } = renderHook(
      ({ name, t }: { name: string; t: number }) => useInterfaceThroughput(interfaces, t, name),
      { initialProps: { name: 'eth0', t: 1000 } },
    )
    rerender({ name: 'eth0', t: 2000 }) // establish one real sample for eth0
    expect(result.current).toHaveLength(1)

    rerender({ name: 'eth1', t: 2000 }) // switch interface, same tick
    expect(result.current).toEqual([]) // cleared, not a bogus eth0-vs-eth1 delta

    rerender({ name: 'eth1', t: 3000 })
    expect(result.current).toHaveLength(1)
  })

  it('does nothing while no interface is selected', () => {
    const { result } = renderHook(() =>
      useInterfaceThroughput([iface('eth0', 1000, 1000)], 1000, undefined),
    )
    expect(result.current).toEqual([])
  })

  it('does nothing for an interface with no stats64 data at all', () => {
    const noStats: NetworkInterface = {
      name: 'eth2',
      mtu: 1500,
      operState: 'up',
      adminState: 'up',
      addresses: [],
    }
    const { result, rerender } = renderHook(
      ({ t }: { t: number }) => useInterfaceThroughput([noStats], t, 'eth2'),
      { initialProps: { t: 1000 } },
    )
    rerender({ t: 2000 })
    expect(result.current).toEqual([])
  })
})
