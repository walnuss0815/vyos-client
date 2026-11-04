import { blankTFTPServerConfig, type TFTPListenAddress, type TFTPServerConfig } from './serviceTftpTypes'
import { isRecord, asString, child, isFlagPresent } from './configTree'

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
