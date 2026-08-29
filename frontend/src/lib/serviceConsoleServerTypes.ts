/**
 * Typed, UI-friendly shape for `service console-server`. Confirmed
 * against vyos-1x's own interface-definition XML source
 * (`interface-definitions/service_console-server.xml.in`). Full
 * coverage - small area.
 *
 * The tag under `device <name>` is NOT a Linux `ttyUSB0`-style device
 * name - VyOS's constraint accepts either `ttyS<N>` (onboard serial
 * ports) or a USB bus/port topology string like `usb1b2p1.1` (from
 * `/dev/serial/by-bus`). No `mode`/terminal-server toggle exists in
 * this schema - every device always gets serial line settings plus an
 * optional SSH wrapper port.
 */

export const CONSOLE_SPEEDS = ['300', '1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200'] as const

export const CONSOLE_PARITIES = ['even', 'odd', 'none'] as const

export interface ConsoleServerDevice {
  /** The tag - a `ttyS<N>` name or a USB bus/port topology string,
   * NOT a Linux `ttyUSB0`-style name. */
  name: string
  description?: string
  alias?: string
  speed?: string
  /** Defaults to '8' in VyOS if unset. */
  dataBits?: string
  /** Defaults to '1' in VyOS if unset. */
  stopBits?: string
  /** Defaults to 'none' in VyOS if unset. */
  parity?: string
  sshPort?: string
}

export function blankConsoleServerDevice(): Omit<ConsoleServerDevice, 'name'> {
  return {}
}

export interface ConsoleServerConfig {
  /** Whether `service console-server` exists at all in the tree. */
  enabled: boolean
  devices: ConsoleServerDevice[]
}

export function blankConsoleServerConfig(): ConsoleServerConfig {
  return { enabled: false, devices: [] }
}
