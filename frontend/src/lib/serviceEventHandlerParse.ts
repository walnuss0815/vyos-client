import {
  blankEventHandlerConfig,
  blankEventHandlerEvent,
  type EventHandlerConfig,
  type EventHandlerEvent,
} from './serviceEventHandlerTypes'

// --- generic VyOS JSON-tree helpers -------------------------------------
// (deliberately duplicated, not shared - see bgpParse.ts's/containerParse.ts's
// own copy of this comment for why this matches the rest of the codebase.)

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  return String(v)
}

function child(node: unknown, key: string): unknown {
  if (!isRecord(node)) return undefined
  return node[key]
}

function entries(node: unknown): [string, unknown][] {
  return isRecord(node) ? Object.entries(node) : []
}

function parseEvent(name: string, raw: unknown): EventHandlerEvent {
  const filterRoot = child(raw, 'filter')
  const scriptRoot = child(raw, 'script')
  return {
    name,
    ...blankEventHandlerEvent(),
    filterPattern: asString(child(filterRoot, 'pattern')),
    filterSyslogIdentifier: asString(child(filterRoot, 'syslog-identifier')),
    scriptPath: asString(child(scriptRoot, 'path')),
    scriptArguments: asString(child(scriptRoot, 'arguments')),
    environment: entries(child(scriptRoot, 'environment'))
      .map(([varName, envRaw]) => ({ name: varName, value: asString(child(envRaw, 'value')) ?? '' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export function parseEventHandlerConfig(eventHandler: unknown): EventHandlerConfig {
  if (eventHandler === undefined) return blankEventHandlerConfig()
  return {
    enabled: true,
    events: entries(child(eventHandler, 'event'))
      .map(([name, raw]) => parseEvent(name, raw))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

// --- path builders -----------------------------------------------------

export function eventHandlerPath(...rest: string[]): string[] {
  return ['service', 'event-handler', ...rest]
}

export function eventHandlerEventPath(name: string, ...rest: string[]): string[] {
  return eventHandlerPath('event', name, ...rest)
}

export function eventHandlerEnvironmentPath(name: string, ...rest: string[]): string[] {
  return eventHandlerEventPath(name, 'script', 'environment', ...rest)
}
