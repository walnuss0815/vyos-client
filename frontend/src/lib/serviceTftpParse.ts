import { blankTFTPServerConfig, type TFTPListenAddress, type TFTPServerConfig } from './serviceTftpTypes'

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

function isFlagPresent(node: unknown, key: string): boolean {
  return isRecord(node) && key in node
}

function entries(node: unknown): [string, unknown][] {
  return isRecord(node) ? Object.entries(node) : []
}

export function parseTFTPServerConfig(tftp: unknown): TFTPServerConfig {
  if (tftp === undefined) return blankTFTPServerConfig()
  return {
    enabled: true,
    directory: asString(child(tftp, 'directory')),
    allowUpload: isFlagPresent(tftp, 'allow-upload'),
    port: asString(child(tftp, 'port')),
    listenAddresses: entries(child(tftp, 'listen-address'))
      .map(([address, raw]): TFTPListenAddress => ({ address, vrf: asString(child(raw, 'vrf')) }))
      .sort((a, b) => a.address.localeCompare(b.address)),
  }
}

// --- path builders -----------------------------------------------------

export function tftpServerPath(...rest: string[]): string[] {
  return ['service', 'tftp-server', ...rest]
}

export function tftpListenAddressPath(address: string, ...rest: string[]): string[] {
  return tftpServerPath('listen-address', address, ...rest)
}
