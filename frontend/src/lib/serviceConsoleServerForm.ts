import { consoleServerDevicePath, consoleServerPath } from './serviceConsoleServerParse'
import type { ConsoleServerDevice } from './serviceConsoleServerTypes'
import type { ConfigOp } from './vyosApi'

export interface ConsoleServerDeviceFormValues {
  description: string
  alias: string
  speed: string
  dataBits: string
  stopBits: string
  parity: string
  sshPort: string
}

export function blankConsoleServerDeviceFormValues(): ConsoleServerDeviceFormValues {
  return { description: '', alias: '', speed: '', dataBits: '', stopBits: '', parity: '', sshPort: '' }
}

export function consoleServerDeviceToFormValues(device: ConsoleServerDevice): ConsoleServerDeviceFormValues {
  return {
    description: device.description ?? '',
    alias: device.alias ?? '',
    speed: device.speed ?? '',
    dataBits: device.dataBits ?? '',
    stopBits: device.stopBits ?? '',
    parity: device.parity ?? '',
    sshPort: device.sshPort ?? '',
  }
}

const SCALAR_FIELDS: { get: (v: ConsoleServerDeviceFormValues) => string; segments: string[] }[] = [
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.alias, segments: ['alias'] },
  { get: (v) => v.speed, segments: ['speed'] },
  { get: (v) => v.dataBits, segments: ['data-bits'] },
  { get: (v) => v.stopBits, segments: ['stop-bits'] },
  { get: (v) => v.parity, segments: ['parity'] },
  { get: (v) => v.sshPort, segments: ['ssh', 'port'] },
]

/** Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. `before === undefined`
 * always includes a bare `set` for the device tag itself, same
 * convention as containerNestedForm.ts's addNetworkAttachmentOps. */
export function consoleServerDeviceFormToOps(
  name: string,
  before: ConsoleServerDevice | undefined,
  values: ConsoleServerDeviceFormValues,
): ConfigOp[] {
  const beforeValues = before ? consoleServerDeviceToFormValues(before) : blankConsoleServerDeviceFormValues()
  const ops: ConfigOp[] = []
  const base = consoleServerDevicePath(name)

  if (before === undefined) ops.push({ op: 'set', path: base })

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export function deleteConsoleServerDeviceOp(name: string): ConfigOp {
  return { op: 'delete', path: consoleServerDevicePath(name) }
}

export function enableConsoleServerOp(): ConfigOp {
  return { op: 'set', path: consoleServerPath() }
}

export function disableConsoleServerOp(): ConfigOp {
  return { op: 'delete', path: consoleServerPath() }
}
