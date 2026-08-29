import { routerAdvertInterfacePath, routerAdvertPrefixPath, routerAdvertRoutePath } from './serviceRouterAdvertParse'
import type { RouterAdvertInterface } from './serviceRouterAdvertTypes'
import type { ConfigOp } from './vyosApi'

export interface RouterAdvertInterfaceFormValues {
  hopLimit: string
  defaultLifetime: string
  defaultPreference: string
  linkMtu: string
  managedFlag: boolean
  intervalMax: string
  intervalMin: string
  nameServerLifetime: string
  otherConfigFlag: boolean
  reachableTime: string
  retransTimer: string
  noSendAdvert: boolean
  noSendInterval: boolean
}

export function blankRouterAdvertInterfaceFormValues(): RouterAdvertInterfaceFormValues {
  return {
    hopLimit: '',
    defaultLifetime: '',
    defaultPreference: '',
    linkMtu: '',
    managedFlag: false,
    intervalMax: '',
    intervalMin: '',
    nameServerLifetime: '',
    otherConfigFlag: false,
    reachableTime: '',
    retransTimer: '',
    noSendAdvert: false,
    noSendInterval: false,
  }
}

export function routerAdvertInterfaceToFormValues(ra: RouterAdvertInterface): RouterAdvertInterfaceFormValues {
  return {
    hopLimit: ra.hopLimit ?? '',
    defaultLifetime: ra.defaultLifetime ?? '',
    defaultPreference: ra.defaultPreference ?? '',
    linkMtu: ra.linkMtu ?? '',
    managedFlag: ra.managedFlag,
    intervalMax: ra.intervalMax ?? '',
    intervalMin: ra.intervalMin ?? '',
    nameServerLifetime: ra.nameServerLifetime ?? '',
    otherConfigFlag: ra.otherConfigFlag,
    reachableTime: ra.reachableTime ?? '',
    retransTimer: ra.retransTimer ?? '',
    noSendAdvert: ra.noSendAdvert,
    noSendInterval: ra.noSendInterval,
  }
}

interface ScalarField {
  get: (v: RouterAdvertInterfaceFormValues) => string
  segments: string[]
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.hopLimit, segments: ['hop-limit'] },
  { get: (v) => v.defaultLifetime, segments: ['default-lifetime'] },
  { get: (v) => v.defaultPreference, segments: ['default-preference'] },
  { get: (v) => v.linkMtu, segments: ['link-mtu'] },
  { get: (v) => v.intervalMax, segments: ['interval', 'max'] },
  { get: (v) => v.intervalMin, segments: ['interval', 'min'] },
  { get: (v) => v.nameServerLifetime, segments: ['name-server-lifetime'] },
  { get: (v) => v.reachableTime, segments: ['reachable-time'] },
  { get: (v) => v.retransTimer, segments: ['retrans-timer'] },
]

interface FlagField {
  get: (v: RouterAdvertInterfaceFormValues) => boolean
  segment: string
}

const FLAG_FIELDS: FlagField[] = [
  { get: (v) => v.managedFlag, segment: 'managed-flag' },
  { get: (v) => v.otherConfigFlag, segment: 'other-config-flag' },
  { get: (v) => v.noSendAdvert, segment: 'no-send-advert' },
  { get: (v) => v.noSendInterval, segment: 'no-send-interval' },
]

/**
 * Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. `before === undefined`
 * means creating a brand-new interface entry - since RA is enabled
 * simply by the tagNode's presence (see RouterAdvertConfig's doc
 * comment), this always includes a bare `set` for the interface path
 * itself, same convention as containerNestedForm.ts's
 * addNetworkAttachmentOps.
 */
export function routerAdvertInterfaceFormToOps(
  interfaceName: string,
  before: RouterAdvertInterface | undefined,
  values: RouterAdvertInterfaceFormValues,
): ConfigOp[] {
  const beforeValues = before ? routerAdvertInterfaceToFormValues(before) : blankRouterAdvertInterfaceFormValues()
  const ops: ConfigOp[] = []
  const base = routerAdvertInterfacePath(interfaceName)

  if (before === undefined) ops.push({ op: 'set', path: base })

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  for (const field of FLAG_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  return ops
}

export function deleteRouterAdvertInterfaceOp(interfaceName: string): ConfigOp {
  return { op: 'delete', path: routerAdvertInterfacePath(interfaceName) }
}

export function addRouterAdvertPrefixOps(
  interfaceName: string,
  prefix: string,
  options: {
    noAutonomousFlag: boolean
    noOnLinkFlag: boolean
    deprecatePrefix: boolean
    decrementLifetime: boolean
    baseInterface: string
    preferredLifetime: string
    validLifetime: string
  },
): ConfigOp[] {
  const base = routerAdvertPrefixPath(interfaceName, prefix)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (options.noAutonomousFlag) ops.push({ op: 'set', path: [...base, 'no-autonomous-flag'] })
  if (options.noOnLinkFlag) ops.push({ op: 'set', path: [...base, 'no-on-link-flag'] })
  if (options.deprecatePrefix) ops.push({ op: 'set', path: [...base, 'deprecate-prefix'] })
  if (options.decrementLifetime) ops.push({ op: 'set', path: [...base, 'decrement-lifetime'] })
  if (options.baseInterface) ops.push({ op: 'set', path: [...base, 'base-interface'], value: options.baseInterface })
  if (options.preferredLifetime) {
    ops.push({ op: 'set', path: [...base, 'preferred-lifetime'], value: options.preferredLifetime })
  }
  if (options.validLifetime) ops.push({ op: 'set', path: [...base, 'valid-lifetime'], value: options.validLifetime })
  return ops
}

export function removeRouterAdvertPrefixOp(interfaceName: string, prefix: string): ConfigOp {
  return { op: 'delete', path: routerAdvertPrefixPath(interfaceName, prefix) }
}

export function addRouterAdvertRouteOps(
  interfaceName: string,
  prefix: string,
  options: { validLifetime: string; routePreference: string; noRemoveRoute: boolean },
): ConfigOp[] {
  const base = routerAdvertRoutePath(interfaceName, prefix)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (options.validLifetime) ops.push({ op: 'set', path: [...base, 'valid-lifetime'], value: options.validLifetime })
  if (options.routePreference) {
    ops.push({ op: 'set', path: [...base, 'route-preference'], value: options.routePreference })
  }
  if (options.noRemoveRoute) ops.push({ op: 'set', path: [...base, 'no-remove-route'] })
  return ops
}

export function removeRouterAdvertRouteOp(interfaceName: string, prefix: string): ConfigOp {
  return { op: 'delete', path: routerAdvertRoutePath(interfaceName, prefix) }
}
