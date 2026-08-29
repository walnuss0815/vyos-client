import { useEffect, useRef, useState } from 'react'
import type { NetworkInterface } from '../lib/vyosApi'

export interface ThroughputSample {
  t: number
  rxBps: number
  txBps: number
}

// Kept in lockstep with useSampleHistory.ts's own DEFAULT_MAX_SAMPLES
// (150, at the Dashboard's 2s poll cadence = a 5-minute window) - a
// duplicated constant rather than importing the shared one, since this
// hook has no other dependency on useSampleHistory and the two are
// conceptually independent (this one derives a rate from cumulative
// counters, the other just accumulates a value as-is) despite sharing
// the same window-length default in practice.
const DEFAULT_MAX_SAMPLES = 150

/**
 * Derives a bytes/sec throughput history for one selected interface
 * from successive `useInterfaces()` polls. VyOS/the kernel only ever
 * reports cumulative rx/tx byte counters (see
 * `backend/internal/vyos/interfaces.go`'s `Interface.RxBytes`/
 * `TxBytes` doc comment) - never a rate - so this hook is what turns
 * two snapshots into a rate: `(bytesNow - bytesPrevious) /
 * secondsElapsed`.
 *
 * Two things this deliberately guards against:
 *   - A negative delta (the counter went backwards) - this can
 *     legitimately happen if the interface flapped and its counters
 *     reset to zero, or after a config change recreates it. Rather
 *     than plotting a huge negative spike (or, if naively treated as
 *     an unsigned wraparound, an absurd multi-exabyte one), this
 *     clamps to 0 and waits for the next tick to establish a new
 *     baseline.
 *   - Switching `interfaceName` - immediately clears the history and
 *     starts a fresh baseline rather than computing a meaningless
 *     rate between two different interfaces' byte counts (or,
 *     equivalently, showing stale history from the previously
 *     selected interface).
 *
 * Like useSampleHistory, ticks are driven by `dataUpdatedAt` (the
 * query's own "a real poll just completed" signal) rather than by the
 * byte counters themselves, so a genuinely idle interface still
 * advances in time instead of freezing the chart.
 */
export function useInterfaceThroughput(
  interfaces: NetworkInterface[] | undefined,
  dataUpdatedAt: number,
  interfaceName: string | undefined,
  maxSamples: number = DEFAULT_MAX_SAMPLES,
): ThroughputSample[] {
  const prevRef = useRef<{ name: string; t: number; rx: number; tx: number } | null>(null)
  const [samples, setSamples] = useState<ThroughputSample[]>([])

  useEffect(() => {
    if (dataUpdatedAt === 0 || !interfaceName) return
    const iface = interfaces?.find((i) => i.name === interfaceName)
    if (!iface || iface.rxBytes === undefined || iface.txBytes === undefined) return

    const prev = prevRef.current
    prevRef.current = { name: interfaceName, t: dataUpdatedAt, rx: iface.rxBytes, tx: iface.txBytes }

    if (!prev || prev.name !== interfaceName) {
      // First sample ever, or the selected interface just changed -
      // nothing valid to diff against yet, so start a clean window.
      setSamples([])
      return
    }
    if (prev.t === dataUpdatedAt) return // re-render without a new poll - nothing to add

    const dtSeconds = (dataUpdatedAt - prev.t) / 1000
    if (dtSeconds <= 0) return

    const rxBps = Math.max(0, (iface.rxBytes - prev.rx) / dtSeconds)
    const txBps = Math.max(0, (iface.txBytes - prev.tx) / dtSeconds)
    setSamples((s) => [...s, { t: dataUpdatedAt, rxBps, txBps }].slice(-maxSamples))
  }, [interfaces, dataUpdatedAt, interfaceName, maxSamples])

  return samples
}
