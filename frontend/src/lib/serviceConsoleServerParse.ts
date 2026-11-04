import {
  blankConsoleServerConfig,
  blankConsoleServerDevice,
  type ConsoleServerConfig,
  type ConsoleServerDevice,
} from './serviceConsoleServerTypes'
import { isRecord, asString, child } from './configTree'

function entries(node: unknown): [string, unknown][] {
  return isRecord(node) ? Object.entries(node) : []
}

function parseDevice(name: string, raw: unknown): ConsoleServerDevice {
  return {
    name,
    ...blankConsoleServerDevice(),
    description: asString(child(raw, 'description')),
    alias: asString(child(raw, 'alias')),
    speed: asString(child(raw, 'speed')),
    dataBits: asString(child(raw, 'data-bits')),
    stopBits: asString(child(raw, 'stop-bits')),
    parity: asString(child(raw, 'parity')),
    sshPort: asString(child(child(raw, 'ssh'), 'port')),
  }
}

export function parseConsoleServerConfig(consoleServer: unknown): ConsoleServerConfig {
  if (consoleServer === undefined) return blankConsoleServerConfig()
  return {
    enabled: true,
    devices: entries(child(consoleServer, 'device'))
      .map(([name, raw]) => parseDevice(name, raw))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

// --- path builders -----------------------------------------------------

export function consoleServerPath(...rest: string[]): string[] {
  return ['service', 'console-server', ...rest]
}

export function consoleServerDevicePath(name: string, ...rest: string[]): string[] {
  return consoleServerPath('device', name, ...rest)
}
