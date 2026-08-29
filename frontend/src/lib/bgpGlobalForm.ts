import { bgpAddressFamilyPath, bgpPath } from './bgpParse'
import type { BGPConfig } from './bgpTypes'
import type { ConfigOp } from './vyosApi'

export interface BGPGlobalFormValues {
  systemAs: string
  routerId: string
}

export function blankGlobalFormValues(): BGPGlobalFormValues {
  return { systemAs: '', routerId: '' }
}

export function globalToFormValues(config: BGPConfig): BGPGlobalFormValues {
  return { systemAs: config.systemAs ?? '', routerId: config.routerId ?? '' }
}

/** Diffs the global systemAs/routerId settings, same set-or-delete
 * pattern as bgpPeerForm.ts's peerFormToOps. */
export function globalFormToOps(before: BGPConfig, values: BGPGlobalFormValues): ConfigOp[] {
  const beforeValues = globalToFormValues(before)
  const ops: ConfigOp[] = []

  if (beforeValues.systemAs !== values.systemAs) {
    const path = bgpPath('system-as')
    if (values.systemAs.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.systemAs.trim() })
  }

  if (beforeValues.routerId !== values.routerId) {
    const path = bgpPath('parameters', 'router-id')
    if (values.routerId.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.routerId.trim() })
  }

  return ops
}

export function addNetworkOp(family: 'ipv4' | 'ipv6', prefix: string): ConfigOp {
  return { op: 'set', path: bgpAddressFamilyPath(family, 'network', prefix) }
}

export function removeNetworkOp(family: 'ipv4' | 'ipv6', prefix: string): ConfigOp {
  return { op: 'delete', path: bgpAddressFamilyPath(family, 'network', prefix) }
}

export function addRedistributionOps(
  family: 'ipv4' | 'ipv6',
  source: string,
  metric: string,
): ConfigOp[] {
  const path = bgpAddressFamilyPath(family, 'redistribute', source)
  const ops: ConfigOp[] = [{ op: 'set', path }]
  const trimmedMetric = metric.trim()
  if (trimmedMetric) {
    ops.push({ op: 'set', path: [...path, 'metric'], value: trimmedMetric })
  }
  return ops
}

export function removeRedistributionOp(family: 'ipv4' | 'ipv6', source: string): ConfigOp {
  return { op: 'delete', path: bgpAddressFamilyPath(family, 'redistribute', source) }
}
