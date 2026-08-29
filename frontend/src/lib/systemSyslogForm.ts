import { syslogLocalPath, syslogRemotePath } from './systemParse'
import type { ConfigOp } from './vyosApi'

export function addLocalFacilityOps(facility: string, level: string): ConfigOp[] {
  const base = syslogLocalPath('facility', facility)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (level) {
    ops.push({ op: 'set', path: [...base, 'level'], value: level })
  }
  return ops
}

export function removeLocalFacilityOp(facility: string): ConfigOp {
  return { op: 'delete', path: syslogLocalPath('facility', facility) }
}

/** Creating a remote host with zero facility rules isn't useful -
 * same "require an initial meaningful child" reasoning as static
 * routes' via requirement / systemGeneralForm's static host mapping
 * address requirement, so `facility` is required here too. */
export function addRemoteHostOps(
  address: string,
  facility: string,
  level: string,
  protocol: '' | 'tcp' | 'udp',
  port: string,
): ConfigOp[] {
  const base = syslogRemotePath(address)
  const facilityPath = [...base, 'facility', facility]
  const ops: ConfigOp[] = [{ op: 'set', path: facilityPath }]
  if (level) {
    ops.push({ op: 'set', path: [...facilityPath, 'level'], value: level })
  }
  if (protocol) {
    ops.push({ op: 'set', path: [...base, 'protocol'], value: protocol })
  }
  const trimmedPort = port.trim()
  if (trimmedPort) {
    ops.push({ op: 'set', path: [...base, 'port'], value: trimmedPort })
  }
  return ops
}

export function deleteRemoteHostOp(address: string): ConfigOp {
  return { op: 'delete', path: syslogRemotePath(address) }
}

export function addRemoteFacilityOps(address: string, facility: string, level: string): ConfigOp[] {
  const base = [...syslogRemotePath(address), 'facility', facility]
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (level) {
    ops.push({ op: 'set', path: [...base, 'level'], value: level })
  }
  return ops
}

export function removeRemoteFacilityOp(address: string, facility: string): ConfigOp {
  return { op: 'delete', path: [...syslogRemotePath(address), 'facility', facility] }
}

export function setRemoteProtocolOp(address: string, protocol: 'tcp' | 'udp'): ConfigOp {
  return { op: 'set', path: [...syslogRemotePath(address), 'protocol'], value: protocol }
}

export function setRemotePortOp(address: string, port: string): ConfigOp {
  return { op: 'set', path: [...syslogRemotePath(address), 'port'], value: port }
}
