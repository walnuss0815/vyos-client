import { tftpListenAddressPath, tftpServerPath } from './serviceTftpParse'
import type { TFTPServerConfig } from './serviceTftpTypes'
import type { ConfigOp } from './vyosApi'

export interface TFTPServerFormValues {
  directory: string
  allowUpload: boolean
  port: string
}

export function blankTFTPServerFormValues(): TFTPServerFormValues {
  return { directory: '', allowUpload: false, port: '' }
}

export function tftpConfigToFormValues(config: TFTPServerConfig): TFTPServerFormValues {
  return { directory: config.directory ?? '', allowUpload: config.allowUpload, port: config.port ?? '' }
}

/** Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. */
export function tftpServerFormToOps(before: TFTPServerConfig, values: TFTPServerFormValues): ConfigOp[] {
  const beforeValues = tftpConfigToFormValues(before)
  const ops: ConfigOp[] = []

  if (beforeValues.directory !== values.directory) {
    const path = tftpServerPath('directory')
    if (values.directory.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.directory.trim() })
  }
  if (beforeValues.allowUpload !== values.allowUpload) {
    const path = tftpServerPath('allow-upload')
    ops.push(values.allowUpload ? { op: 'set', path } : { op: 'delete', path })
  }
  if (beforeValues.port !== values.port) {
    const path = tftpServerPath('port')
    if (values.port.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.port.trim() })
  }

  return ops
}

export function enableTFTPServerOp(): ConfigOp {
  return { op: 'set', path: tftpServerPath() }
}

export function disableTFTPServerOp(): ConfigOp {
  return { op: 'delete', path: tftpServerPath() }
}

export function addTFTPListenAddressOps(address: string, vrf: string): ConfigOp[] {
  const base = tftpListenAddressPath(address)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (vrf.trim()) ops.push({ op: 'set', path: [...base, 'vrf'], value: vrf.trim() })
  return ops
}

export function removeTFTPListenAddressOp(address: string): ConfigOp {
  return { op: 'delete', path: tftpListenAddressPath(address) }
}
