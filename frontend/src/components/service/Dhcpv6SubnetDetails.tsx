import { useState } from 'react'
import ChipList from '../ChipList'
import { dhcpv6OptionPath, dhcpv6SubnetPath } from '../../lib/serviceDhcpv6ServerParse'
import {
  addDHCPv6PrefixDelegationOps,
  addDHCPv6RangeOps,
  addDHCPv6StaticMappingOps,
  blankDHCPv6SubnetFormValues,
  deleteDHCPv6SubnetOp,
  dhcpv6SubnetFormToOps,
  dhcpv6SubnetToFormValues,
  removeDHCPv6PrefixDelegationOp,
  removeDHCPv6RangeOp,
  removeDHCPv6StaticMappingOp,
  type DHCPv6SubnetFormValues,
} from '../../lib/serviceDhcpv6ServerForm'
import type { DHCPv6SharedNetwork, DHCPv6Subnet } from '../../lib/serviceDhcpv6ServerTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

export default function Dhcpv6SubnetDetails({ network }: { network: DHCPv6SharedNetwork }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingCidr, setEditingCidr] = useState<string | null>(null)
  const [expandedCidr, setExpandedCidr] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(cidr: string) {
    const op = deleteDHCPv6SubnetOp(network.name, cidr)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingCidr ? network.subnets.find((s) => s.cidr === editingCidr) : undefined

  return (
    <div className="mt-3 border-t border-surface-border pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Subnets ({network.subnets.length})
        </p>
        <button onClick={() => setShowCreate((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showCreate ? 'Cancel' : '+ Add subnet'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-2">
          <SubnetForm networkName={network.name} existingCidrs={network.subnets.map((s) => s.cidr)} onDone={() => setShowCreate(false)} />
        </div>
      )}
      {editing && (
        <div className="mb-2">
          <SubnetForm
            networkName={network.name}
            subnet={editing}
            existingCidrs={network.subnets.map((s) => s.cidr)}
            onDone={() => setEditingCidr(null)}
          />
        </div>
      )}

      <div className="space-y-2">
        {network.subnets.map((subnet) => (
          <div key={subnet.cidr} className="rounded border border-surface-border p-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-slate-300">{subnet.cidr}</span>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setExpandedCidr((c) => (c === subnet.cidr ? null : subnet.cidr))} className="text-accent-500 hover:text-accent-400">
                  {expandedCidr === subnet.cidr ? 'Hide' : 'Details'}
                </button>
                <button
                  onClick={() => {
                    setEditingCidr(subnet.cidr)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(subnet.cidr)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
            {expandedCidr === subnet.cidr && <SubnetContents networkName={network.name} subnet={subnet} />}
          </div>
        ))}
        {network.subnets.length === 0 && <p className="text-xs text-slate-500">No subnets configured.</p>}
      </div>
    </div>
  )
}

function SubnetForm({
  networkName,
  subnet,
  existingCidrs,
  onDone,
}: {
  networkName: string
  subnet?: DHCPv6Subnet
  existingCidrs: string[]
  onDone: () => void
}) {
  const [cidr, setCidr] = useState(subnet?.cidr ?? '')
  const [values, setValues] = useState<DHCPv6SubnetFormValues>(
    subnet ? dhcpv6SubnetToFormValues(subnet) : blankDHCPv6SubnetFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = subnet === undefined
  const trimmedCidr = cidr.trim()
  const taken = isCreate && existingCidrs.includes(trimmedCidr)
  const canSubmit = trimmedCidr !== '' && !taken

  function update<K extends keyof DHCPv6SubnetFormValues>(key: K, value: DHCPv6SubnetFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = dhcpv6SubnetFormToOps(networkName, trimmedCidr, subnet, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="rounded border border-surface-border p-3">
      <div className="grid grid-cols-3 gap-2">
        <input
          {...noExtensionInputProps}
          disabled={!isCreate}
          value={cidr}
          onChange={(e) => setCidr(e.target.value)}
          placeholder="2001:db8::/64"
          className={`${inputClass} disabled:opacity-60`}
        />
        <input {...noExtensionInputProps} value={values.interface} onChange={(e) => update('interface', e.target.value)} placeholder="interface" className={inputClass} />
        <input {...noExtensionInputProps} value={values.subnetId} onChange={(e) => update('subnetId', e.target.value)} placeholder="subnet-id" className={inputClass} />
        <input {...noExtensionInputProps} value={values.leaseDefault} onChange={(e) => update('leaseDefault', e.target.value)} placeholder="lease default (s)" className={inputClass} />
        <input {...noExtensionInputProps} value={values.leaseMaximum} onChange={(e) => update('leaseMaximum', e.target.value)} placeholder="lease maximum (s)" className={inputClass} />
        <input {...noExtensionInputProps} value={values.leaseMinimum} onChange={(e) => update('leaseMinimum', e.target.value)} placeholder="lease minimum (s)" className={inputClass} />
      </div>
      {taken && <p className="mt-1 text-xs text-danger-500">This subnet already exists.</p>}
      <div className="mt-2 flex gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Add subnet' : 'Save'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}

function SubnetContents({ networkName, subnet }: { networkName: string; subnet: DHCPv6Subnet }) {
  const base = dhcpv6SubnetPath(networkName, subnet.cidr)
  return (
    <div className="mt-2 space-y-3 border-t border-surface-border pt-2">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="mb-1 text-xs text-slate-500">Name servers</p>
          <ChipList values={subnet.option.nameServers} basePath={dhcpv6OptionPath(base)} leaf="name-server" pathLabel={`${base.join(' ')} option name-server`} placeholder="2001:db8::1" />
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500">Domain search</p>
          <ChipList values={subnet.option.domainSearch} basePath={dhcpv6OptionPath(base)} leaf="domain-search" pathLabel={`${base.join(' ')} option domain-search`} placeholder="example.com" />
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500">SNTP servers</p>
          <ChipList values={subnet.option.sntpServers} basePath={dhcpv6OptionPath(base)} leaf="sntp-server" pathLabel={`${base.join(' ')} option sntp-server`} placeholder="2001:db8::2" />
        </div>
      </div>

      <RangesSection networkName={networkName} subnet={subnet} />
      <StaticMappingsSection networkName={networkName} subnet={subnet} />
      <PrefixDelegationsSection networkName={networkName} subnet={subnet} />
    </div>
  )
}

function RangesSection({ networkName, subnet }: { networkName: string; subnet: DHCPv6Subnet }) {
  const [showAdd, setShowAdd] = useState(false)
  const [id, setId] = useState('')
  const [prefix, setPrefix] = useState('')
  const [start, setStart] = useState('')
  const [stop, setStop] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedId = id.trim()
  const taken = subnet.ranges.some((r) => r.id === trimmedId)
  const valid = trimmedId !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addDHCPv6RangeOps(networkName, subnet.cidr, trimmedId, prefix, start, stop)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setId('')
    setPrefix('')
    setStart('')
    setStop('')
    setShowAdd(false)
  }

  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-xs text-slate-500">
        Address ranges
        <InfoTooltip text="Which addresses in this subnet the server may hand out - specify either a bare prefix to use its whole span, or a start/stop pair for an arbitrary sub-range, not both." />
      </p>
      {subnet.ranges.map((r) => (
        <div key={r.id} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {r.id}: {r.prefix ?? `${r.start ?? '?'} - ${r.stop ?? '?'}`}
          </span>
          <button onClick={() => { const op = removeDHCPv6RangeOp(networkName, subnet.cidr, r.id); add({ op, label: `delete ${op.path.join(' ')}` }) }} className="text-xs text-slate-500 hover:text-danger-500">
            Remove
          </button>
        </div>
      ))}
      {subnet.ranges.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add range'}
      </button>
      {showAdd && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input {...noExtensionInputProps} value={id} onChange={(e) => setId(e.target.value)} placeholder="name" className={inputClass} />
          <input {...noExtensionInputProps} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="prefix" className={inputClass} />
          <input {...noExtensionInputProps} value={start} onChange={(e) => setStart(e.target.value)} placeholder="start" className={inputClass} />
          <input {...noExtensionInputProps} value={stop} onChange={(e) => setStop(e.target.value)} placeholder="stop" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`col-span-4 bg-accent-600 ${buttonClass}`}>
            Add range
          </button>
          {taken && <p className="col-span-4 text-xs text-danger-500">This range name is already used.</p>}
        </div>
      )}
    </div>
  )
}

function StaticMappingsSection({ networkName, subnet }: { networkName: string; subnet: DHCPv6Subnet }) {
  const [showAdd, setShowAdd] = useState(false)
  const [hostname, setHostname] = useState('')
  const [mac, setMac] = useState('')
  const [duid, setDuid] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedHostname = hostname.trim()
  const taken = subnet.staticMappings.some((m) => m.hostname === trimmedHostname)
  const valid = trimmedHostname !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addDHCPv6StaticMappingOps(networkName, subnet.cidr, trimmedHostname, { mac, duid, disabled: false })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setHostname('')
    setMac('')
    setDuid('')
    setShowAdd(false)
  }

  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-xs text-slate-500">
        Static mappings
        <InfoTooltip text="Reserves fixed addresses/prefixes for a specific client, matched by MAC or DUID - hostname here is just the identifying tag for this reservation, not a DNS assignment." />
      </p>
      {subnet.staticMappings.map((m) => (
        <div key={m.hostname} className="mb-1 rounded border border-surface-border p-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-slate-300">
              {m.hostname}
              {m.mac && <span className="text-slate-500"> mac={m.mac}</span>}
              {m.duid && <span className="text-slate-500"> duid={m.duid}</span>}
            </span>
            <button onClick={() => { const op = removeDHCPv6StaticMappingOp(networkName, subnet.cidr, m.hostname); add({ op, label: `delete ${op.path.join(' ')}` }) }} className="text-xs text-slate-500 hover:text-danger-500">
              Remove
            </button>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <ChipList
              values={m.ipv6Addresses}
              basePath={[...dhcpv6SubnetPath(networkName, subnet.cidr), 'static-mapping', m.hostname]}
              leaf="ipv6-address"
              pathLabel={`static-mapping ${m.hostname} ipv6-address`}
              placeholder="2001:db8::100"
            />
            <ChipList
              values={m.ipv6Prefixes}
              basePath={[...dhcpv6SubnetPath(networkName, subnet.cidr), 'static-mapping', m.hostname]}
              leaf="ipv6-prefix"
              pathLabel={`static-mapping ${m.hostname} ipv6-prefix`}
              placeholder="2001:db8:1::/64"
            />
          </div>
        </div>
      ))}
      {subnet.staticMappings.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add static mapping'}
      </button>
      {showAdd && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <input {...noExtensionInputProps} value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="hostname" className={inputClass} />
          <input {...noExtensionInputProps} value={mac} onChange={(e) => setMac(e.target.value)} placeholder="mac (optional)" className={inputClass} />
          <input {...noExtensionInputProps} value={duid} onChange={(e) => setDuid(e.target.value)} placeholder="duid (optional)" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>
            Add mapping
          </button>
          {taken && <p className="col-span-3 text-xs text-danger-500">This hostname is already used.</p>}
        </div>
      )}
    </div>
  )
}

function PrefixDelegationsSection({ networkName, subnet }: { networkName: string; subnet: DHCPv6Subnet }) {
  const [showAdd, setShowAdd] = useState(false)
  const [prefix, setPrefix] = useState('')
  const [prefixLength, setPrefixLength] = useState('')
  const [delegatedLength, setDelegatedLength] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedPrefix = prefix.trim()
  const taken = subnet.prefixDelegations.some((p) => p.prefix === trimmedPrefix)
  const valid = trimmedPrefix !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addDHCPv6PrefixDelegationOps(networkName, subnet.cidr, trimmedPrefix, {
      prefixLength,
      delegatedLength,
      excludedPrefix: '',
      excludedPrefixLength: '',
    })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setPrefix('')
    setPrefixLength('')
    setDelegatedLength('')
    setShowAdd(false)
  }

  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-xs text-slate-500">
        Prefix delegation
        <InfoTooltip text="Hands out whole IPv6 prefixes (via IA_PD) to requesting downstream routers, rather than single addresses - the delegated length is how large a chunk each requester receives out of the source prefix." />
      </p>
      {subnet.prefixDelegations.map((pd) => (
        <div key={pd.prefix} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {pd.prefix}
            {pd.prefixLength && `/${pd.prefixLength}`}
            {pd.delegatedLength && <span className="text-slate-500"> → /{pd.delegatedLength}</span>}
          </span>
          <button onClick={() => { const op = removeDHCPv6PrefixDelegationOp(networkName, subnet.cidr, pd.prefix); add({ op, label: `delete ${op.path.join(' ')}` }) }} className="text-xs text-slate-500 hover:text-danger-500">
            Remove
          </button>
        </div>
      ))}
      {subnet.prefixDelegations.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add prefix delegation'}
      </button>
      {showAdd && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <input {...noExtensionInputProps} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="delegating prefix (bare address)" className={inputClass} />
          <input {...noExtensionInputProps} value={prefixLength} onChange={(e) => setPrefixLength(e.target.value)} placeholder="prefix-length (32-64)" className={inputClass} />
          <input {...noExtensionInputProps} value={delegatedLength} onChange={(e) => setDelegatedLength(e.target.value)} placeholder="delegated-length (32-96)" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          {taken && <p className="col-span-3 text-xs text-danger-500">This prefix is already delegated.</p>}
        </div>
      )}
    </div>
  )
}
