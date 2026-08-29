/**
 * Typed, UI-friendly shape for `service event-handler`. Confirmed
 * against vyos-1x's own interface-definition XML source
 * (`interface-definitions/service_event-handler.xml.in`, only 71
 * lines). Full coverage - entirely free-text leaves plus one small
 * nested tagNode (`script environment`), no enums or defaults
 * anywhere in the schema.
 *
 * `script path` is validated server-side by VyOS's `script` validator
 * (must already exist on the router) - this app can't create the
 * script file itself, only reference an existing path.
 */

export interface EventHandlerEnvironmentVariable {
  name: string
  value: string
}

export interface EventHandlerEvent {
  name: string
  filterPattern?: string
  filterSyslogIdentifier?: string
  scriptPath?: string
  scriptArguments?: string
  environment: EventHandlerEnvironmentVariable[]
}

export function blankEventHandlerEvent(): Omit<EventHandlerEvent, 'name'> {
  return { environment: [] }
}

export interface EventHandlerConfig {
  /** Whether `service event-handler` exists at all in the tree. */
  enabled: boolean
  events: EventHandlerEvent[]
}

export function blankEventHandlerConfig(): EventHandlerConfig {
  return { enabled: false, events: [] }
}
