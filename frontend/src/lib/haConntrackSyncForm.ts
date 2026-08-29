import { conntrackSyncInterfacePath, conntrackSyncPath } from './haParse'
import type { ConntrackSyncConfig } from './haTypes'
import type { ConfigOp } from './vyosApi'

export interface ConntrackSyncFormValues {
  disableExternalCache: boolean
  disableSyslog: boolean
  eventListenQueueSize: string
  startupResync: boolean
  vrrpSyncGroup: string
  mcastGroup: string
  syncQueueSize: string
  purgeTimeout: string
}

export function conntrackSyncToFormValues(config: ConntrackSyncConfig): ConntrackSyncFormValues {
  return {
    disableExternalCache: config.disableExternalCache,
    disableSyslog: config.disableSyslog,
    eventListenQueueSize: String(config.eventListenQueueSize),
    startupResync: config.startupResync,
    vrrpSyncGroup: config.vrrpSyncGroup ?? '',
    mcastGroup: config.mcastGroup,
    syncQueueSize: String(config.syncQueueSize),
    purgeTimeout: String(config.purgeTimeout),
  }
}

const FLAG_FIELDS: { get: (v: ConntrackSyncFormValues) => boolean; segments: string[] }[] = [
  { get: (v) => v.disableExternalCache, segments: ['disable-external-cache'] },
  { get: (v) => v.disableSyslog, segments: ['disable-syslog'] },
  { get: (v) => v.startupResync, segments: ['startup-resync'] },
]

const SCALAR_FIELDS: { get: (v: ConntrackSyncFormValues) => string; segments: string[] }[] = [
  { get: (v) => v.eventListenQueueSize, segments: ['event-listen-queue-size'] },
  { get: (v) => v.vrrpSyncGroup, segments: ['failover-mechanism', 'vrrp', 'sync-group'] },
  { get: (v) => v.mcastGroup, segments: ['mcast-group'] },
  { get: (v) => v.syncQueueSize, segments: ['sync-queue-size'] },
  { get: (v) => v.purgeTimeout, segments: ['purge-timeout'] },
]

/** Builds ops for conntrack-sync's scalar/flag settings (not
 * accept-protocol/expect-sync/ignore-address/listen-address, which are
 * plain multi-valued leaves better suited to ChipList.tsx, or the
 * nested `interface <name>` list, which has its own add/remove
 * helpers below). `vrrpSyncGroup` (failover-mechanism vrrp sync-group)
 * is required by VyOS's own conf-mode script whenever conntrack-sync
 * is configured at all - the UI still lets it be blank since this is
 * a settings-diff helper, not a full-form validator; VyOS's own commit
 * validation surfaces a clear error if left unset. */
export function conntrackSyncFormToOps(
  before: ConntrackSyncFormValues,
  values: ConntrackSyncFormValues,
): ConfigOp[] {
  const base = conntrackSyncPath()
  const ops: ConfigOp[] = []

  for (const field of FLAG_FIELDS) {
    const oldValue = field.get(before)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(before)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export function addConntrackSyncInterfaceOps(name: string, peer: string, port: string): ConfigOp[] {
  const base = conntrackSyncInterfacePath(name)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (peer.trim() !== '') ops.push({ op: 'set', path: [...base, 'peer'], value: peer.trim() })
  if (port.trim() !== '') ops.push({ op: 'set', path: [...base, 'port'], value: port.trim() })
  return ops
}

export function removeConntrackSyncInterfaceOp(name: string): ConfigOp {
  return { op: 'delete', path: conntrackSyncInterfacePath(name) }
}
