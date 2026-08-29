import { ntpPath, ntpServerPath } from './serviceNtpParse'
import type { NTPConfig } from './serviceNtpTypes'
import type { ConfigOp } from './vyosApi'

export interface NTPGeneralFormValues {
  interface: string
  sourceInterface: string
  vrf: string
  leapSecond: string
  localStratum: string
}

export function blankNTPGeneralFormValues(): NTPGeneralFormValues {
  return { interface: '', sourceInterface: '', vrf: '', leapSecond: '', localStratum: '' }
}

export function ntpConfigToGeneralFormValues(config: NTPConfig): NTPGeneralFormValues {
  return {
    interface: config.interface ?? '',
    sourceInterface: config.sourceInterface ?? '',
    vrf: config.vrf ?? '',
    leapSecond: config.leapSecond ?? '',
    localStratum: config.localStratum ?? '',
  }
}

interface ScalarField {
  get: (v: NTPGeneralFormValues) => string
  segment: string
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.interface, segment: 'interface' },
  { get: (v) => v.sourceInterface, segment: 'source-interface' },
  { get: (v) => v.vrf, segment: 'vrf' },
  { get: (v) => v.leapSecond, segment: 'leap-second' },
  { get: (v) => v.localStratum, segment: 'local-stratum' },
]

/** Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. */
export function ntpGeneralFormToOps(before: NTPConfig, values: NTPGeneralFormValues): ConfigOp[] {
  const beforeValues = ntpConfigToGeneralFormValues(before)
  const ops: ConfigOp[] = []

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = ntpPath(field.segment)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export interface NTPServerFlags {
  prefer: boolean
  pool: boolean
  noselect: boolean
  nts: boolean
  ptp: boolean
  interleave: boolean
}

export function blankNTPServerFlags(): NTPServerFlags {
  return { prefer: false, pool: false, noselect: false, nts: false, ptp: false, interleave: false }
}

/** Creating an NTP server always sets the whole set of flags fresh
 * (there's no "before" state for a brand-new server) - same one-shot
 * creation pattern as containerNestedForm.ts's addNetworkAttachmentOps. */
export function addNTPServerOps(address: string, flags: NTPServerFlags): ConfigOp[] {
  const base = ntpServerPath(address)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  for (const [flag, enabled] of Object.entries(flags)) {
    if (enabled) ops.push({ op: 'set', path: [...base, flag] })
  }
  return ops
}

export function removeNTPServerOp(address: string): ConfigOp {
  return { op: 'delete', path: ntpServerPath(address) }
}
