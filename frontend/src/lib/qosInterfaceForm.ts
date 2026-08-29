import { qosInterfacePath } from './qosParse'
import type { ConfigOp } from './vyosApi'

/** `qos interface <ifname> { ingress <policy>, egress <policy> }` -
 * unlike everything else under `qos`, this "policy" isn't a tagNode
 * with its own set of fields - it's just two optional scalar
 * references, so a single set/delete-per-direction helper covers
 * create/edit/remove without needing a separate blank/toFormValues
 * pair. */
export function setQosInterfaceDirectionOp(ifname: string, direction: 'ingress' | 'egress', policyName: string): ConfigOp {
  const path = qosInterfacePath(ifname, direction)
  return policyName.trim() === '' ? { op: 'delete', path } : { op: 'set', path, value: policyName.trim() }
}

export function deleteQosInterfaceBindingOp(ifname: string): ConfigOp {
  return { op: 'delete', path: qosInterfacePath(ifname) }
}
