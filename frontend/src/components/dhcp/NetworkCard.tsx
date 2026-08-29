import { useState } from 'react'
import ChipList from '../ChipList'
import { sharedNetworkPath, subnetPath } from '../../lib/dhcpConfigParse'
import {
  sharedNetworkFormToOps,
  sharedNetworkToFormValues,
  type SharedNetworkFormValues,
} from '../../lib/dhcpConfigForm'
import type { DHCPSharedNetwork } from '../../lib/dhcpConfigTypes'
import { computePoolUtilization, type PoolUtilization } from '../../lib/dhcpPoolUtilization'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import type { DHCPLease } from '../../lib/vyosApi'
import { usePendingChangesStore } from '../../store/pendingChanges'
import SubnetCard from './SubnetCard'

/** One shared network (DHCP pool): authoritative/options edit form,
 * a pool-utilization bar (combining its configured range sizes with
 * live lease counts - see lib/dhcpPoolUtilization.ts), and every
 * subnet nested underneath. */
export default function NetworkCard({ network, leases }: { network: DHCPSharedNetwork; leases: DHCPLease[] }) {
  const [editing, setEditing] = useState(false)
  const [showAddSubnet, setShowAddSubnet] = useState(false)
  const add = usePendingChangesStore((s) => s.add)
  const basePath = sharedNetworkPath(network.name)
  const pathLabel = `service dhcp-server shared-network-name ${network.name}`
  const utilization = computePoolUtilization(network, leases)

  function queueDelete() {
    add({ op: { op: 'delete', path: basePath }, label: `delete ${pathLabel}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-mono text-sm font-medium text-white">{network.name}</h3>
          {network.authoritative && (
            <span className="rounded bg-accent-600/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-accent-500">
              Authoritative
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          <button onClick={() => setEditing((v) => !v)} className="text-accent-500 hover:text-accent-400">
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button onClick={queueDelete} className="text-slate-500 hover:text-danger-500">
            Delete network
          </button>
        </div>
      </div>

      {utilization.size > 0 ? (
        <div className="mt-3">
          <UtilizationBar utilization={utilization} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">No dynamic ranges configured yet.</p>
      )}

      {editing && <NetworkEditForm network={network} onDone={() => setEditing(false)} />}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <p className="mb-1 text-xs text-slate-500">DNS servers</p>
          <ChipList
            values={network.options.nameServers}
            basePath={[...basePath, 'option']}
            leaf="name-server"
            pathLabel={`${pathLabel} option name-server`}
            placeholder="192.168.1.1"
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500">NTP servers</p>
          <ChipList
            values={network.options.ntpServers}
            basePath={[...basePath, 'option']}
            leaf="ntp-server"
            pathLabel={`${pathLabel} option ntp-server`}
            placeholder="192.168.1.1"
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500">Domain search</p>
          <ChipList
            values={network.options.domainSearch}
            basePath={[...basePath, 'option']}
            leaf="domain-search"
            pathLabel={`${pathLabel} option domain-search`}
            placeholder="example.com"
          />
        </div>
      </div>

      <div className="mt-4 border-t border-surface-border pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Subnets</p>
          <button
            onClick={() => setShowAddSubnet((v) => !v)}
            className={`bg-accent-600 ${buttonClass}`}
          >
            {showAddSubnet ? 'Cancel' : '+ Add subnet'}
          </button>
        </div>

        {showAddSubnet && (
          <CreateSubnetForm
            networkName={network.name}
            existingCidrs={network.subnets.map((s) => s.cidr)}
            onDone={() => setShowAddSubnet(false)}
          />
        )}

        <div className="space-y-3">
          {network.subnets.map((subnet) => (
            <SubnetCard key={subnet.cidr} networkName={network.name} subnet={subnet} />
          ))}
          {network.subnets.length === 0 && <p className="text-xs text-slate-500">No subnets yet.</p>}
        </div>
      </div>
    </div>
  )
}

function UtilizationBar({ utilization }: { utilization: PoolUtilization }) {
  const barColor =
    utilization.usagePercent >= 90
      ? 'bg-danger-500'
      : utilization.usagePercent >= 70
        ? 'bg-warning-500'
        : 'bg-success-500'

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {utilization.leased} / {utilization.size} leased
        </span>
        <span>{utilization.usagePercent}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-800">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${utilization.usagePercent}%` }} />
      </div>
    </div>
  )
}

function CreateSubnetForm({
  networkName,
  existingCidrs,
  onDone,
}: {
  networkName: string
  existingCidrs: string[]
  onDone: () => void
}) {
  const [cidr, setCidr] = useState('')
  const [subnetId, setSubnetId] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedCidr = cidr.trim()
  const cidrValid = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(trimmedCidr)
  const cidrTaken = existingCidrs.includes(trimmedCidr)
  const valid = cidrValid && !cidrTaken && subnetId.trim() !== ''

  function submit() {
    if (!valid) return
    const base = subnetPath(networkName, trimmedCidr)
    add({
      op: { op: 'set', path: [...base, 'subnet-id'], value: subnetId.trim() },
      label: `set ... subnet ${trimmedCidr} subnet-id '${subnetId.trim()}'`,
    })
    onDone()
  }

  return (
    <div className="mb-3 rounded-lg border border-surface-border bg-surface-800/50 p-3">
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Subnet CIDR
          <input
            {...noExtensionInputProps}
            autoFocus
            value={cidr}
            onChange={(e) => setCidr(e.target.value)}
            placeholder="192.168.1.0/24"
            className={inputClass}
          />
          {trimmedCidr !== '' && !cidrValid && <span className="text-danger-500">Must be a valid CIDR.</span>}
          {cidrTaken && <span className="text-danger-500">subnet {trimmedCidr} already exists.</span>}
        </label>
        <label className={labelClass}>
          Subnet ID
          <input
            {...noExtensionInputProps}
            value={subnetId}
            onChange={(e) => setSubnetId(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="1 (must be unique across every subnet)"
            className={inputClass}
          />
        </label>
      </div>
      <button onClick={submit} disabled={!valid} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Queue subnet creation
      </button>
    </div>
  )
}

function NetworkEditForm({ network, onDone }: { network: DHCPSharedNetwork; onDone: () => void }) {
  const [values, setValues] = useState<SharedNetworkFormValues>(sharedNetworkToFormValues(network))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof SharedNetworkFormValues>(key: K, value: SharedNetworkFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = sharedNetworkFormToOps(network.name, network, values)
    for (const op of ops) {
      const field = op.path[op.path.length - 1]
      add({ op, label: `${op.op} ... shared-network-name ${network.name} ${field}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      <label className={labelClass}>
        Default router
        <input
          {...noExtensionInputProps}
          autoFocus
          value={values.defaultRouter}
          onChange={(e) => update('defaultRouter', e.target.value)}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Domain name
        <input
          {...noExtensionInputProps}
          value={values.domainName}
          onChange={(e) => update('domainName', e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={values.authoritative}
          onChange={(e) => update('authoritative', e.target.checked)}
          className="accent-accent-500"
        />
        Authoritative (the only DHCP server for this network)
      </label>

      <div className="col-span-2 flex items-center gap-2">
        <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
          Queue changes
        </button>
        <button
          onClick={onDone}
          className="rounded border border-surface-border px-2 py-1 text-xs text-slate-300 hover:bg-surface-800"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
