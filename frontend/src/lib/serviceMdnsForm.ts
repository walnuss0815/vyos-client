import { mdnsRepeaterPath } from './serviceMdnsParse'
import type { MdnsRepeaterConfig } from './serviceMdnsTypes'
import type { ConfigOp } from './vyosApi'

export interface MdnsRepeaterFormValues {
  disabled: boolean
  ipVersion: string
  cacheEntries: string
  vrrpDisable: boolean
}

export function blankMdnsRepeaterFormValues(): MdnsRepeaterFormValues {
  return { disabled: false, ipVersion: '', cacheEntries: '', vrrpDisable: false }
}

export function mdnsConfigToFormValues(config: MdnsRepeaterConfig): MdnsRepeaterFormValues {
  return {
    disabled: config.disabled,
    ipVersion: config.ipVersion ?? '',
    cacheEntries: config.cacheEntries ?? '',
    vrrpDisable: config.vrrpDisable,
  }
}

/** Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. */
export function mdnsRepeaterFormToOps(
  before: MdnsRepeaterConfig,
  values: MdnsRepeaterFormValues,
): ConfigOp[] {
  const beforeValues = mdnsConfigToFormValues(before)
  const ops: ConfigOp[] = []

  if (beforeValues.disabled !== values.disabled) {
    const path = mdnsRepeaterPath('disable')
    ops.push(values.disabled ? { op: 'set', path } : { op: 'delete', path })
  }
  if (beforeValues.vrrpDisable !== values.vrrpDisable) {
    const path = mdnsRepeaterPath('vrrp-disable')
    ops.push(values.vrrpDisable ? { op: 'set', path } : { op: 'delete', path })
  }
  if (beforeValues.ipVersion !== values.ipVersion) {
    const path = mdnsRepeaterPath('ip-version')
    if (values.ipVersion.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.ipVersion.trim() })
  }
  if (beforeValues.cacheEntries !== values.cacheEntries) {
    const path = mdnsRepeaterPath('cache-entries')
    if (values.cacheEntries.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.cacheEntries.trim() })
  }

  return ops
}

export function enableMdnsRepeaterOp(): ConfigOp {
  return { op: 'set', path: mdnsRepeaterPath() }
}

export function disableMdnsRepeaterOp(): ConfigOp {
  return { op: 'delete', path: mdnsRepeaterPath() }
}
