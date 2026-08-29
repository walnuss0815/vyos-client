import { haPath, vrrpGroupPath, vrrpPath, vrrpSyncGroupPath } from './haParse'
import type { VRRPGroup, VRRPSyncGroup } from './haTypes'
import type { ConfigOp } from './vyosApi'

// --- top-level / global toggles ------------------------------------

export function toggleHADisableOp(disabled: boolean): ConfigOp {
  const path = haPath('disable')
  return disabled ? { op: 'set', path } : { op: 'delete', path }
}

export function toggleVrrpSnmpTrapOp(enabled: boolean): ConfigOp {
  const path = vrrpPath('snmp', 'trap')
  return enabled ? { op: 'set', path } : { op: 'delete', path }
}

export interface VRRPGlobalFormValues {
  startupDelay: string
  version: string
  garpInterval: string
  garpMasterDelay: string
  garpMasterRefresh: string
  garpMasterRefreshRepeat: string
  garpMasterRepeat: string
}

const GLOBAL_SCALAR_FIELDS: { get: (v: VRRPGlobalFormValues) => string; segments: string[] }[] = [
  { get: (v) => v.startupDelay, segments: ['global-parameters', 'startup-delay'] },
  { get: (v) => v.version, segments: ['global-parameters', 'version'] },
  { get: (v) => v.garpInterval, segments: ['global-parameters', 'garp', 'interval'] },
  { get: (v) => v.garpMasterDelay, segments: ['global-parameters', 'garp', 'master-delay'] },
  { get: (v) => v.garpMasterRefresh, segments: ['global-parameters', 'garp', 'master-refresh'] },
  { get: (v) => v.garpMasterRefreshRepeat, segments: ['global-parameters', 'garp', 'master-refresh-repeat'] },
  { get: (v) => v.garpMasterRepeat, segments: ['global-parameters', 'garp', 'master-repeat'] },
]

export function vrrpGlobalFormToOps(before: VRRPGlobalFormValues, values: VRRPGlobalFormValues): ConfigOp[] {
  const ops: ConfigOp[] = []
  for (const field of GLOBAL_SCALAR_FIELDS) {
    const oldValue = field.get(before)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = vrrpPath(...field.segments)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

// --- VRRP groups ---------------------------------------------------

export interface VRRPGroupFormValues {
  interface: string
  vrid: string
  priority: string
  advertiseInterval: string
  description: string
  disabled: boolean
  noPreempt: boolean
  preemptDelay: string
  rfc3768Compatibility: boolean
  helloSourceAddress: string
  authenticationPassword: string
  authenticationType: string
  excludeVrrpInterface: boolean
  healthCheckPing: string
  healthCheckScript: string
  healthCheckFailureCount: string
  healthCheckInterval: string
  healthCheckTimeout: string
  transitionMaster: string
  transitionBackup: string
  transitionFault: string
  transitionStop: string
}

export function blankVRRPGroupFormValues(): VRRPGroupFormValues {
  return {
    interface: '',
    vrid: '',
    priority: '',
    advertiseInterval: '',
    description: '',
    disabled: false,
    noPreempt: false,
    preemptDelay: '',
    rfc3768Compatibility: false,
    helloSourceAddress: '',
    authenticationPassword: '',
    authenticationType: '',
    excludeVrrpInterface: false,
    healthCheckPing: '',
    healthCheckScript: '',
    healthCheckFailureCount: '',
    healthCheckInterval: '',
    healthCheckTimeout: '',
    transitionMaster: '',
    transitionBackup: '',
    transitionFault: '',
    transitionStop: '',
  }
}

export function vrrpGroupToFormValues(group: VRRPGroup): VRRPGroupFormValues {
  return {
    interface: group.interface ?? '',
    vrid: group.vrid ?? '',
    priority: String(group.priority),
    advertiseInterval: String(group.advertiseInterval),
    description: group.description ?? '',
    disabled: group.disabled,
    noPreempt: group.noPreempt,
    preemptDelay: String(group.preemptDelay),
    rfc3768Compatibility: group.rfc3768Compatibility,
    helloSourceAddress: group.helloSourceAddress ?? '',
    authenticationPassword: group.authenticationPassword ?? '',
    authenticationType: group.authenticationType ?? '',
    excludeVrrpInterface: group.excludeVrrpInterface,
    healthCheckPing: group.healthCheck?.ping ?? '',
    healthCheckScript: group.healthCheck?.script ?? '',
    healthCheckFailureCount: group.healthCheck ? String(group.healthCheck.failureCount) : '',
    healthCheckInterval: group.healthCheck ? String(group.healthCheck.interval) : '',
    healthCheckTimeout: group.healthCheck?.timeout !== undefined ? String(group.healthCheck.timeout) : '',
    transitionMaster: group.transitionScripts.master ?? '',
    transitionBackup: group.transitionScripts.backup ?? '',
    transitionFault: group.transitionScripts.fault ?? '',
    transitionStop: group.transitionScripts.stop ?? '',
  }
}

const GROUP_FLAG_FIELDS: { get: (v: VRRPGroupFormValues) => boolean; segments: string[] }[] = [
  { get: (v) => v.disabled, segments: ['disable'] },
  { get: (v) => v.noPreempt, segments: ['no-preempt'] },
  { get: (v) => v.rfc3768Compatibility, segments: ['rfc3768-compatibility'] },
  { get: (v) => v.excludeVrrpInterface, segments: ['track', 'exclude-vrrp-interface'] },
]

const GROUP_SCALAR_FIELDS: { get: (v: VRRPGroupFormValues) => string; segments: string[] }[] = [
  { get: (v) => v.interface, segments: ['interface'] },
  { get: (v) => v.vrid, segments: ['vrid'] },
  { get: (v) => v.priority, segments: ['priority'] },
  { get: (v) => v.advertiseInterval, segments: ['advertise-interval'] },
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.preemptDelay, segments: ['preempt-delay'] },
  { get: (v) => v.helloSourceAddress, segments: ['hello-source-address'] },
  { get: (v) => v.healthCheckPing, segments: ['health-check', 'ping'] },
  { get: (v) => v.healthCheckScript, segments: ['health-check', 'script'] },
  { get: (v) => v.healthCheckFailureCount, segments: ['health-check', 'failure-count'] },
  { get: (v) => v.healthCheckInterval, segments: ['health-check', 'interval'] },
  { get: (v) => v.healthCheckTimeout, segments: ['health-check', 'timeout'] },
  { get: (v) => v.transitionMaster, segments: ['transition-script', 'master'] },
  { get: (v) => v.transitionBackup, segments: ['transition-script', 'backup'] },
  { get: (v) => v.transitionFault, segments: ['transition-script', 'fault'] },
  { get: (v) => v.transitionStop, segments: ['transition-script', 'stop'] },
]

/** Builds the ops for creating or editing a `vrrp group <name>` (not
 * its nested `address`/`excluded-address`/`peer-address`/`track
 * interface` lists - see the add/remove helpers below). Authentication
 * is diffed as a single unit (password+type together) since VyOS
 * requires both to be set together or neither at all - see
 * vyos-1x's high-availability.py verify(). */
export function vrrpGroupFormToOps(
  name: string,
  before: VRRPGroup | undefined,
  values: VRRPGroupFormValues,
): ConfigOp[] {
  const base = vrrpGroupPath(name)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })

  const beforeValues = before ? vrrpGroupToFormValues(before) : blankVRRPGroupFormValues()

  for (const field of GROUP_FLAG_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  for (const field of GROUP_SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  const authPath = [...base, 'authentication']
  const hadAuth = beforeValues.authenticationPassword !== '' && beforeValues.authenticationType !== ''
  const hasAuth = values.authenticationPassword.trim() !== '' && values.authenticationType.trim() !== ''
  if (
    beforeValues.authenticationPassword !== values.authenticationPassword ||
    beforeValues.authenticationType !== values.authenticationType
  ) {
    if (!hasAuth) {
      if (hadAuth) ops.push({ op: 'delete', path: authPath })
    } else {
      ops.push({ op: 'set', path: [...authPath, 'password'], value: values.authenticationPassword.trim() })
      ops.push({ op: 'set', path: [...authPath, 'type'], value: values.authenticationType.trim() })
    }
  }

  return ops
}

export function deleteVRRPGroupOp(name: string): ConfigOp {
  return { op: 'delete', path: vrrpGroupPath(name) }
}

export function addVRRPGroupAddressOps(
  groupName: string,
  leaf: 'address' | 'excluded-address',
  address: string,
  iface: string,
): ConfigOp[] {
  const base = [...vrrpGroupPath(groupName), leaf, address]
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (iface.trim() !== '') ops.push({ op: 'set', path: [...base, 'interface'], value: iface.trim() })
  return ops
}

export function removeVRRPGroupAddressOp(
  groupName: string,
  leaf: 'address' | 'excluded-address',
  address: string,
): ConfigOp {
  return { op: 'delete', path: [...vrrpGroupPath(groupName), leaf, address] }
}

// --- VRRP sync-groups ------------------------------------------------

export interface VRRPSyncGroupFormValues {
  healthCheckPing: string
  healthCheckScript: string
  healthCheckFailureCount: string
  healthCheckInterval: string
  healthCheckTimeout: string
  transitionMaster: string
  transitionBackup: string
  transitionFault: string
  transitionStop: string
}

export function blankVRRPSyncGroupFormValues(): VRRPSyncGroupFormValues {
  return {
    healthCheckPing: '',
    healthCheckScript: '',
    healthCheckFailureCount: '',
    healthCheckInterval: '',
    healthCheckTimeout: '',
    transitionMaster: '',
    transitionBackup: '',
    transitionFault: '',
    transitionStop: '',
  }
}

export function vrrpSyncGroupToFormValues(group: VRRPSyncGroup): VRRPSyncGroupFormValues {
  return {
    healthCheckPing: group.healthCheck?.ping ?? '',
    healthCheckScript: group.healthCheck?.script ?? '',
    healthCheckFailureCount: group.healthCheck ? String(group.healthCheck.failureCount) : '',
    healthCheckInterval: group.healthCheck ? String(group.healthCheck.interval) : '',
    healthCheckTimeout: group.healthCheck?.timeout !== undefined ? String(group.healthCheck.timeout) : '',
    transitionMaster: group.transitionScripts.master ?? '',
    transitionBackup: group.transitionScripts.backup ?? '',
    transitionFault: group.transitionScripts.fault ?? '',
    transitionStop: group.transitionScripts.stop ?? '',
  }
}

const SYNC_GROUP_SCALAR_FIELDS: { get: (v: VRRPSyncGroupFormValues) => string; segments: string[] }[] = [
  { get: (v) => v.healthCheckPing, segments: ['health-check', 'ping'] },
  { get: (v) => v.healthCheckScript, segments: ['health-check', 'script'] },
  { get: (v) => v.healthCheckFailureCount, segments: ['health-check', 'failure-count'] },
  { get: (v) => v.healthCheckInterval, segments: ['health-check', 'interval'] },
  { get: (v) => v.healthCheckTimeout, segments: ['health-check', 'timeout'] },
  { get: (v) => v.transitionMaster, segments: ['transition-script', 'master'] },
  { get: (v) => v.transitionBackup, segments: ['transition-script', 'backup'] },
  { get: (v) => v.transitionFault, segments: ['transition-script', 'fault'] },
  { get: (v) => v.transitionStop, segments: ['transition-script', 'stop'] },
]

/** Builds ops for creating/editing a `vrrp sync-group <name>` (not its
 * `member` list, which is diffed separately as a checkbox multi-select
 * against sibling group names - see HaproxyServiceFormPanel's
 * `backend` selection for the identical pattern). */
export function vrrpSyncGroupFormToOps(
  name: string,
  before: VRRPSyncGroup | undefined,
  values: VRRPSyncGroupFormValues,
): ConfigOp[] {
  const base = vrrpSyncGroupPath(name)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })

  const beforeValues = before ? vrrpSyncGroupToFormValues(before) : blankVRRPSyncGroupFormValues()
  for (const field of SYNC_GROUP_SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

export function deleteVRRPSyncGroupOp(name: string): ConfigOp {
  return { op: 'delete', path: vrrpSyncGroupPath(name) }
}

export function addVRRPSyncGroupMemberOp(syncGroupName: string, memberName: string): ConfigOp {
  return { op: 'set', path: vrrpSyncGroupPath(syncGroupName, 'member'), value: memberName }
}

export function removeVRRPSyncGroupMemberOp(syncGroupName: string, memberName: string): ConfigOp {
  return { op: 'delete', path: vrrpSyncGroupPath(syncGroupName, 'member'), value: memberName }
}
