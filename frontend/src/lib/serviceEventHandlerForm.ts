import { eventHandlerEventPath, eventHandlerPath } from './serviceEventHandlerParse'
import type { EventHandlerEvent } from './serviceEventHandlerTypes'
import type { ConfigOp } from './vyosApi'

export interface EventHandlerEventFormValues {
  filterPattern: string
  filterSyslogIdentifier: string
  scriptPath: string
  scriptArguments: string
}

export function blankEventHandlerEventFormValues(): EventHandlerEventFormValues {
  return { filterPattern: '', filterSyslogIdentifier: '', scriptPath: '', scriptArguments: '' }
}

export function eventHandlerEventToFormValues(event: EventHandlerEvent): EventHandlerEventFormValues {
  return {
    filterPattern: event.filterPattern ?? '',
    filterSyslogIdentifier: event.filterSyslogIdentifier ?? '',
    scriptPath: event.scriptPath ?? '',
    scriptArguments: event.scriptArguments ?? '',
  }
}

/** Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. `before === undefined`
 * always includes a bare `set` for the event tag itself, same
 * convention as containerNestedForm.ts's addNetworkAttachmentOps. */
export function eventHandlerEventFormToOps(
  name: string,
  before: EventHandlerEvent | undefined,
  values: EventHandlerEventFormValues,
): ConfigOp[] {
  const beforeValues = before ? eventHandlerEventToFormValues(before) : blankEventHandlerEventFormValues()
  const ops: ConfigOp[] = []
  const base = eventHandlerEventPath(name)

  if (before === undefined) ops.push({ op: 'set', path: base })

  const fields: { get: (v: EventHandlerEventFormValues) => string; segments: string[] }[] = [
    { get: (v) => v.filterPattern, segments: ['filter', 'pattern'] },
    { get: (v) => v.filterSyslogIdentifier, segments: ['filter', 'syslog-identifier'] },
    { get: (v) => v.scriptPath, segments: ['script', 'path'] },
    { get: (v) => v.scriptArguments, segments: ['script', 'arguments'] },
  ]
  for (const field of fields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export function deleteEventHandlerEventOp(name: string): ConfigOp {
  return { op: 'delete', path: eventHandlerEventPath(name) }
}

export function enableEventHandlerOp(): ConfigOp {
  return { op: 'set', path: eventHandlerPath() }
}

export function disableEventHandlerOp(): ConfigOp {
  return { op: 'delete', path: eventHandlerPath() }
}
