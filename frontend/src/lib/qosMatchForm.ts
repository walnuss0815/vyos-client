import type { ConfigOp } from './vyosApi'

/** A practical subset of QosMatch's full field set, offered when
 * *creating* a new match rule - see qosTypes.ts's QosMatch doc comment
 * for why ether/TCP-flags/max-length matching aren't included here
 * (still parsed/displayed correctly for existing matches, just not
 * exposed in this "add" form). Shared by every classful policy type's
 * class match list and by `qos traffic-match-group`'s own match list -
 * callers pass whichever `basePath` (a class path or a match-group
 * path) the match should be created under. */
export interface QosMatchOptions {
  ipSourceAddress: string
  ipSourcePort: string
  ipDestinationAddress: string
  ipDestinationPort: string
  ipProtocol: string
  ipDscp: string
  ipv6SourceAddress: string
  ipv6SourcePort: string
  ipv6DestinationAddress: string
  ipv6DestinationPort: string
  ipv6Protocol: string
  ipv6Dscp: string
  interfaceName: string
  mark: string
  vif: string
}

export function blankQosMatchOptions(): QosMatchOptions {
  return {
    ipSourceAddress: '',
    ipSourcePort: '',
    ipDestinationAddress: '',
    ipDestinationPort: '',
    ipProtocol: '',
    ipDscp: '',
    ipv6SourceAddress: '',
    ipv6SourcePort: '',
    ipv6DestinationAddress: '',
    ipv6DestinationPort: '',
    ipv6Protocol: '',
    ipv6Dscp: '',
    interfaceName: '',
    mark: '',
    vif: '',
  }
}

/** Builds the ops for a new `match <id>` under basePath (a class path
 * or a `qos traffic-match-group <name>` path). VyOS itself rejects
 * mixing `ip`/`ipv6` in one match, and mixing `interface` with `ip`/
 * `ipv6`/`ether` - this app doesn't duplicate that validation
 * client-side, letting VyOS's own commit-time error surface instead,
 * the same "trust the authenticated session, let VyOS validate"
 * approach most of this app's fields already take. */
export function addQosMatchOps(basePath: string[], matchId: string, options: QosMatchOptions): ConfigOp[] {
  const base = [...basePath, 'match', matchId]
  const ops: ConfigOp[] = [{ op: 'set', path: base }]

  if (options.ipSourceAddress) ops.push({ op: 'set', path: [...base, 'ip', 'source', 'address'], value: options.ipSourceAddress })
  if (options.ipSourcePort) ops.push({ op: 'set', path: [...base, 'ip', 'source', 'port'], value: options.ipSourcePort })
  if (options.ipDestinationAddress) {
    ops.push({ op: 'set', path: [...base, 'ip', 'destination', 'address'], value: options.ipDestinationAddress })
  }
  if (options.ipDestinationPort) ops.push({ op: 'set', path: [...base, 'ip', 'destination', 'port'], value: options.ipDestinationPort })
  if (options.ipProtocol) ops.push({ op: 'set', path: [...base, 'ip', 'protocol'], value: options.ipProtocol })
  if (options.ipDscp) ops.push({ op: 'set', path: [...base, 'ip', 'dscp'], value: options.ipDscp })

  if (options.ipv6SourceAddress) {
    ops.push({ op: 'set', path: [...base, 'ipv6', 'source', 'address'], value: options.ipv6SourceAddress })
  }
  if (options.ipv6SourcePort) ops.push({ op: 'set', path: [...base, 'ipv6', 'source', 'port'], value: options.ipv6SourcePort })
  if (options.ipv6DestinationAddress) {
    ops.push({ op: 'set', path: [...base, 'ipv6', 'destination', 'address'], value: options.ipv6DestinationAddress })
  }
  if (options.ipv6DestinationPort) {
    ops.push({ op: 'set', path: [...base, 'ipv6', 'destination', 'port'], value: options.ipv6DestinationPort })
  }
  if (options.ipv6Protocol) ops.push({ op: 'set', path: [...base, 'ipv6', 'protocol'], value: options.ipv6Protocol })
  if (options.ipv6Dscp) ops.push({ op: 'set', path: [...base, 'ipv6', 'dscp'], value: options.ipv6Dscp })

  if (options.interfaceName) ops.push({ op: 'set', path: [...base, 'interface'], value: options.interfaceName })
  if (options.mark) ops.push({ op: 'set', path: [...base, 'mark'], value: options.mark })
  if (options.vif) ops.push({ op: 'set', path: [...base, 'vif'], value: options.vif })

  return ops
}

export function removeQosMatchOp(basePath: string[], matchId: string): ConfigOp {
  return { op: 'delete', path: [...basePath, 'match', matchId] }
}

export function addQosMatchGroupRefOp(basePath: string[], groupName: string): ConfigOp {
  return { op: 'set', path: [...basePath, 'match-group'], value: groupName }
}

export function removeQosMatchGroupRefOp(basePath: string[], groupName: string): ConfigOp {
  return { op: 'delete', path: [...basePath, 'match-group'], value: groupName }
}
