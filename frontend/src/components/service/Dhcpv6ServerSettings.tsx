import { useState } from 'react'
import ChipList from '../ChipList'
import Dhcpv6SubnetDetails from './Dhcpv6SubnetDetails'
import {
  dhcpv6GlobalParametersPath,
  dhcpv6RangePath,
  dhcpv6ServerPath,
  dhcpv6SharedNetworkPath,
} from '../../lib/serviceDhcpv6ServerParse'
import {
  blankDHCPv6GlobalFormValues,
  blankDHCPv6SharedNetworkFormValues,
  deleteDHCPv6SharedNetworkOp,
  dhcpv6ConfigToGlobalFormValues,
  dhcpv6GlobalFormToOps,
  dhcpv6SharedNetworkFormToOps,
  dhcpv6SharedNetworkToFormValues,
  disableDHCPv6ServerOp,
  enableDHCPv6ServerOp,
  type DHCPv6SharedNetworkFormValues,
} from '../../lib/serviceDhcpv6ServerForm'
import { DHCPV6_LOG_LEVELS, type DHCPv6ServerConfig, type DHCPv6SharedNetwork } from '../../lib/serviceDhcpv6ServerTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function Dhcpv6ServerSettings({ config }: { config: DHCPv6ServerConfig }) {
  const add = usePendingChangesStore((s) => s.add)

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">The DHCPv6 server is not configured.</p>
        <button
          onClick={() => {
            const op = enableDHCPv6ServerOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable DHCPv6 server
        </button>
      </div>
    )
  }

  return <Dhcpv6ServerSettingsForm config={config} />
}

function Dhcpv6ServerSettingsForm({ config }: { config: DHCPv6ServerConfig }) {
  const [values, setValues] = useState(() => dhcpv6ConfigToGlobalFormValues(config))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankDHCPv6GlobalFormValues>>(
    key: K,
    value: ReturnType<typeof blankDHCPv6GlobalFormValues>[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = dhcpv6GlobalFormToOps(config, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  function queueDisable() {
    const op = disableDHCPv6ServerOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-3 gap-3">
          <FieldLabel label="Preference" hint="Advertised to clients so they can choose between multiple DHCPv6 servers on the same link - higher values are preferred; leave blank for the default of 0.">
            <input {...noExtensionInputProps} value={values.preference} onChange={(e) => update('preference', e.target.value)} placeholder="0-255" className={inputClass} />
          </FieldLabel>
          <FieldLabel label="Log level" hint="How verbose the Kea DHCPv6 daemon's own log output is - separate from any global syslog verbosity settings elsewhere.">
            <select value={values.logLevel} onChange={(e) => update('logLevel', e.target.value)} className={inputClass}>
              <option value="">Default (info)</option>
              {DHCPV6_LOG_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </FieldLabel>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.disabled} onChange={(e) => update('disabled', e.target.checked)} className="accent-accent-500" />
            Disable DHCPv6 server
            <InfoTooltip text="Keeps the shared networks and subnets below configured without actually running the DHCPv6 daemon - use to pause service temporarily without deleting settings." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.disableRouteAutoinstall} onChange={(e) => update('disableRouteAutoinstall', e.target.checked)} className="accent-accent-500" />
            Don't install routes for delegated prefixes
            <InfoTooltip text="Normally, when this server hands out an IPv6 prefix via delegation, it also adds a route for it so traffic to that prefix reaches the requesting client - this suppresses that automatic route." />
          </label>
        </div>
        <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
          Save settings
        </button>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Listen interfaces</p>
            <ChipList values={config.listenInterfaces} basePath={dhcpv6ServerPath()} leaf="listen-interface" pathLabel="service dhcpv6-server listen-interface" placeholder="eth0" />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Global name servers</p>
            <ChipList values={config.globalNameServers} basePath={dhcpv6GlobalParametersPath()} leaf="name-server" pathLabel="service dhcpv6-server global-parameters name-server" placeholder="2001:db8::1" />
          </div>
        </div>
      </div>

      <SharedNetworkList config={config} />

      <div>
        <button onClick={queueDisable} className="text-xs text-danger-500 hover:text-danger-400">
          Disable DHCPv6 server entirely
        </button>
      </div>
    </div>
  )
}

function SharedNetworkList({ config }: { config: DHCPv6ServerConfig }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [expandedName, setExpandedName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(name: string) {
    const op = deleteDHCPv6SharedNetworkOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? config.sharedNetworks.find((n) => n.name === editingName) : undefined

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Shared networks ({config.sharedNetworks.length})
        </h2>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingName(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New shared network'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-3">
          <SharedNetworkForm existingNames={config.sharedNetworks.map((n) => n.name)} onDone={() => setShowCreate(false)} />
        </div>
      )}
      {editing && (
        <div className="mb-3">
          <SharedNetworkForm
            network={editing}
            existingNames={config.sharedNetworks.map((n) => n.name)}
            onDone={() => setEditingName(null)}
          />
        </div>
      )}

      <div className="space-y-3">
        {config.sharedNetworks.map((network) => (
          <div key={network.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-sm font-medium text-white">{network.name}</span>
                {network.disabled && (
                  <span className="ml-2 rounded bg-danger-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-danger-500">
                    disabled
                  </span>
                )}
                <p className="text-xs text-slate-400">{network.description || 'no description set'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button onClick={() => setExpandedName((n) => (n === network.name ? null : network.name))} className="text-accent-500 hover:text-accent-400">
                  {expandedName === network.name ? 'Hide subnets' : 'Subnets'}
                </button>
                <button
                  onClick={() => {
                    setEditingName(network.name)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(network.name)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
            {expandedName === network.name && <Dhcpv6SubnetDetails network={network} />}
          </div>
        ))}
        {config.sharedNetworks.length === 0 && <p className="text-xs text-slate-500">No shared networks configured yet.</p>}
      </div>
    </div>
  )
}

function SharedNetworkForm({
  network,
  existingNames,
  onDone,
}: {
  network?: DHCPv6SharedNetwork
  existingNames: string[]
  onDone: () => void
}) {
  const [name, setName] = useState(network?.name ?? '')
  const [values, setValues] = useState<DHCPv6SharedNetworkFormValues>(
    network ? dhcpv6SharedNetworkToFormValues(network) : blankDHCPv6SharedNetworkFormValues(),
  )
  const [firstSubnetCidr, setFirstSubnetCidr] = useState('')
  const [firstSubnetId, setFirstSubnetId] = useState('')
  const [firstRangeStart, setFirstRangeStart] = useState('')
  const [firstRangeStop, setFirstRangeStop] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = network === undefined
  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof DHCPv6SharedNetworkFormValues>(key: K, value: DHCPv6SharedNetworkFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = dhcpv6SharedNetworkFormToOps(trimmedName, network, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    // VyOS refuses to commit a DHCPv6 subnet with no address range,
    // static mapping, or prefix delegation at all - and Dhcpv6SubnetDetails.tsx
    // (the normal way to add a subnet) only ever operates on an
    // already-fetched, real shared network, so a brand new one has no
    // way to get a subnet - let alone a range - before its own first
    // commit without this. Queuing it here, in the same commit as
    // creation, is what breaks that deadlock - same pattern as
    // dhcp/NetworksPage.tsx's CreateNetworkForm for the DHCPv4 sibling
    // feature.
    const trimmedCidr = firstSubnetCidr.trim()
    if (isCreate && trimmedCidr) {
      const subnetId = firstSubnetId.trim()
      if (subnetId) {
        add({
          op: { op: 'set', path: [...dhcpv6SharedNetworkPath(trimmedName), 'subnet', trimmedCidr, 'subnet-id'], value: subnetId },
          label: `set ... subnet ${trimmedCidr} subnet-id '${subnetId}'`,
        })
      }
      if (firstRangeStart.trim() && firstRangeStop.trim()) {
        const rangeBase = dhcpv6RangePath(trimmedName, trimmedCidr, '0')
        add({ op: { op: 'set', path: rangeBase }, label: `set ... range 0` })
        add({
          op: { op: 'set', path: [...rangeBase, 'start'], value: firstRangeStart.trim() },
          label: `set ... range 0 start '${firstRangeStart.trim()}'`,
        })
        add({
          op: { op: 'set', path: [...rangeBase, 'stop'], value: firstRangeStop.trim() },
          label: `set ... range 0 stop '${firstRangeStop.trim()}'`,
        })
      }
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">{isCreate ? 'New shared network' : `Edit ${network.name}`}</h3>
      <div className="grid grid-cols-3 gap-3">
        <label className={labelClass}>
          Name *
          <input
            {...noExtensionInputProps}
            autoFocus
            disabled={!isCreate}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
          />
          {nameTaken && <span className="text-danger-500">This network already exists.</span>}
        </label>
        <label className={labelClass}>
          Description
          <input {...noExtensionInputProps} value={values.description} onChange={(e) => update('description', e.target.value)} className={inputClass} />
        </label>
        <FieldLabel label="Interface" hint="Restricts this shared network to a single interface - leave blank to let it apply to any interface whose subnets fall within one of the ranges configured below.">
          <input {...noExtensionInputProps} value={values.interface} onChange={(e) => update('interface', e.target.value)} className={inputClass} />
        </FieldLabel>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={values.disabled} onChange={(e) => update('disabled', e.target.checked)} className="accent-accent-500" />
        Disable this shared network
        <InfoTooltip text="Stops this specific network from being served while leaving other shared networks on the DHCPv6 server active." />
      </label>

      {isCreate && (
        <div className="mt-3 border-t border-surface-border pt-3">
          <p className="mb-2 text-xs text-slate-500">
            VyOS requires a DHCPv6 subnet to have at least one address range, static mapping, or
            prefix delegation before it can be committed - fill in a first subnet and range now, or
            add a subnet the normal way (once this network exists) and give it a static mapping or
            prefix delegation instead.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              First subnet CIDR (optional)
              <input
                {...noExtensionInputProps}
                value={firstSubnetCidr}
                onChange={(e) => setFirstSubnetCidr(e.target.value)}
                placeholder="2001:db8::/64"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              First subnet ID
              <input
                {...noExtensionInputProps}
                value={firstSubnetId}
                onChange={(e) => setFirstSubnetId(e.target.value)}
                placeholder="1"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              First range start (optional)
              <input
                {...noExtensionInputProps}
                value={firstRangeStart}
                onChange={(e) => setFirstRangeStart(e.target.value)}
                placeholder="2001:db8::100"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              First range stop (optional)
              <input
                {...noExtensionInputProps}
                value={firstRangeStop}
                onChange={(e) => setFirstRangeStop(e.target.value)}
                placeholder="2001:db8::1ff"
                className={inputClass}
              />
            </label>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}
