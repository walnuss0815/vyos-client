import { ndpProxyInterfacePath, ndpProxyPath, ndpProxyPrefixPath } from './serviceNdpProxyParse'
import type { NDPProxyInterface } from './serviceNdpProxyTypes'
import type { ConfigOp } from './vyosApi'

export interface NDPProxyInterfaceFormValues {
  disabled: boolean
  enableRouterBit: boolean
  timeout: string
  ttl: string
}

export function blankNDPProxyInterfaceFormValues(): NDPProxyInterfaceFormValues {
  return { disabled: false, enableRouterBit: false, timeout: '', ttl: '' }
}

export function ndpProxyInterfaceToFormValues(iface: NDPProxyInterface): NDPProxyInterfaceFormValues {
  return {
    disabled: iface.disabled,
    enableRouterBit: iface.enableRouterBit,
    timeout: iface.timeout ?? '',
    ttl: iface.ttl ?? '',
  }
}

/** Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. `before === undefined`
 * always includes a bare `set` for the interface tag itself, same
 * convention as containerNestedForm.ts's addNetworkAttachmentOps. */
export function ndpProxyInterfaceFormToOps(
  interfaceName: string,
  before: NDPProxyInterface | undefined,
  values: NDPProxyInterfaceFormValues,
): ConfigOp[] {
  const beforeValues = before ? ndpProxyInterfaceToFormValues(before) : blankNDPProxyInterfaceFormValues()
  const ops: ConfigOp[] = []
  const base = ndpProxyInterfacePath(interfaceName)

  if (before === undefined) ops.push({ op: 'set', path: base })

  if (beforeValues.disabled !== values.disabled) {
    const path = [...base, 'disable']
    ops.push(values.disabled ? { op: 'set', path } : { op: 'delete', path })
  }
  if (beforeValues.enableRouterBit !== values.enableRouterBit) {
    const path = [...base, 'enable-router-bit']
    ops.push(values.enableRouterBit ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: NDPProxyInterfaceFormValues) => string; segment: string }[] = [
    { get: (v) => v.timeout, segment: 'timeout' },
    { get: (v) => v.ttl, segment: 'ttl' },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export function deleteNDPProxyInterfaceOp(interfaceName: string): ConfigOp {
  return { op: 'delete', path: ndpProxyInterfacePath(interfaceName) }
}

export function addNDPProxyPrefixOps(
  interfaceName: string,
  prefix: string,
  options: { mode: string; interfaceRef: string; disabled: boolean },
): ConfigOp[] {
  const base = ndpProxyPrefixPath(interfaceName, prefix)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (options.mode) ops.push({ op: 'set', path: [...base, 'mode'], value: options.mode })
  if (options.interfaceRef.trim()) {
    ops.push({ op: 'set', path: [...base, 'interface'], value: options.interfaceRef.trim() })
  }
  if (options.disabled) ops.push({ op: 'set', path: [...base, 'disable'] })
  return ops
}

export function removeNDPProxyPrefixOp(interfaceName: string, prefix: string): ConfigOp {
  return { op: 'delete', path: ndpProxyPrefixPath(interfaceName, prefix) }
}

export interface NDPProxyGlobalFormValues {
  routeRefresh: string
}

export function blankNDPProxyGlobalFormValues(): NDPProxyGlobalFormValues {
  return { routeRefresh: '' }
}

export function ndpProxyGlobalFormToOps(
  before: { routeRefresh?: string },
  values: NDPProxyGlobalFormValues,
): ConfigOp[] {
  const beforeValue = before.routeRefresh ?? ''
  if (beforeValue === values.routeRefresh) return []
  const path = ndpProxyPath('route-refresh')
  if (values.routeRefresh.trim() === '') return [{ op: 'delete', path }]
  return [{ op: 'set', path, value: values.routeRefresh.trim() }]
}

export function enableNDPProxyOp(): ConfigOp {
  return { op: 'set', path: ndpProxyPath() }
}

export function disableNDPProxyOp(): ConfigOp {
  return { op: 'delete', path: ndpProxyPath() }
}
