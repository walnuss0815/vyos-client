import { useState } from 'react'
import ChipList from '../ChipList'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import {
  subnetFormToOps,
  subnetToFormValues,
  type SubnetFormValues,
} from '../../lib/dhcpConfigForm'
import { subnetPath } from '../../lib/dhcpConfigParse'
import type { DHCPSubnet } from '../../lib/dhcpConfigTypes'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import RangeList from './RangeList'
import StaticMappingSection from './StaticMappingSection'

/** One subnet within a shared network - subnet-id/lease/options edit
 * form, dynamic ranges, excluded addresses, and static mappings. */
export default function SubnetCard({ networkName, subnet }: { networkName: string; subnet: DHCPSubnet }) {
  const [editing, setEditing] = useState(false)
  const add = usePendingChangesStore((s) => s.add)
  const basePath = subnetPath(networkName, subnet.cidr)
  const pathLabel = `service dhcp-server shared-network-name ${networkName} subnet ${subnet.cidr}`

  function queueDelete() {
    add({ op: { op: 'delete', path: basePath }, label: `delete ${pathLabel}` })
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface-800/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-mono text-sm font-medium text-white">{subnet.cidr}</h4>
          <p className="text-xs text-slate-500">
            subnet-id {subnet.subnetId ?? '—'} · lease {subnet.lease ?? 86400}s
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          <button onClick={() => setEditing((v) => !v)} className="text-accent-500 hover:text-accent-400">
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button onClick={queueDelete} className="text-slate-500 hover:text-danger-500">
            Delete subnet
          </button>
        </div>
      </div>

      {editing && <SubnetEditForm networkName={networkName} subnet={subnet} onDone={() => setEditing(false)} />}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <p className="mb-1 text-xs text-slate-500">DNS servers</p>
          <ChipList
            values={subnet.options.nameServers}
            basePath={[...basePath, 'option']}
            leaf="name-server"
            pathLabel={`${pathLabel} option name-server`}
            placeholder="192.168.1.1"
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500">NTP servers</p>
          <ChipList
            values={subnet.options.ntpServers}
            basePath={[...basePath, 'option']}
            leaf="ntp-server"
            pathLabel={`${pathLabel} option ntp-server`}
            placeholder="192.168.1.1"
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500">Domain search</p>
          <ChipList
            values={subnet.options.domainSearch}
            basePath={[...basePath, 'option']}
            leaf="domain-search"
            pathLabel={`${pathLabel} option domain-search`}
            placeholder="example.com"
          />
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs text-slate-500">Dynamic ranges</p>
        <RangeList networkName={networkName} cidr={subnet.cidr} ranges={subnet.ranges} />
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs text-slate-500">Excluded addresses</p>
        <ChipList
          values={subnet.excludes}
          basePath={basePath}
          leaf="exclude"
          pathLabel={`${pathLabel} exclude`}
          placeholder="192.168.1.99"
        />
      </div>

      <StaticMappingSection
        networkName={networkName}
        cidr={subnet.cidr}
        mappings={subnet.staticMappings}
        ranges={subnet.ranges}
        excludes={subnet.excludes}
      />
    </div>
  )
}

function SubnetEditForm({
  networkName,
  subnet,
  onDone,
}: {
  networkName: string
  subnet: DHCPSubnet
  onDone: () => void
}) {
  const [values, setValues] = useState<SubnetFormValues>(subnetToFormValues(subnet))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof SubnetFormValues>(key: K, value: SubnetFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = subnetFormToOps(networkName, subnet.cidr, subnet, values)
    for (const op of ops) {
      const field = op.path[op.path.length - 1]
      add({ op, label: `${op.op} ... subnet ${subnet.cidr} ${field}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      <label className={labelClass}>
        Subnet ID
        <input
          {...noExtensionInputProps}
          autoFocus
          value={values.subnetId}
          onChange={(e) => update('subnetId', e.target.value.replace(/[^0-9]/g, ''))}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Lease time (seconds)
        <input
          {...noExtensionInputProps}
          value={values.lease}
          onChange={(e) => update('lease', e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="86400"
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Default router
        <input
          {...noExtensionInputProps}
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
