import { useState } from 'react'
import NetworkCard from '../../components/dhcp/NetworkCard'
import { useDHCPConfig } from '../../hooks/useDHCPConfig'
import { useDHCPLeases } from '../../hooks/useDHCPLeases'
import { rangePath, sharedNetworkPath } from '../../lib/dhcpConfigParse'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { isValidVyOSIdentifier } from '../../lib/vyosIdentifier'
import { usePendingChangesStore } from '../../store/pendingChanges'

/**
 * Shared-network (DHCP pool) management: create/delete networks, each
 * with its subnets, ranges, excludes, options, and static mappings
 * nested underneath (see NetworkCard.tsx). Combines config
 * (useDHCPConfig) with live lease counts (useDHCPLeases, the same
 * data the Leases tab shows) for the pool-utilization bars.
 */
export default function NetworksPage() {
  const { sharedNetworks, isLoading, isError } = useDHCPConfig()
  const leasesQuery = useDHCPLeases()
  const [showCreate, setShowCreate] = useState(false)

  const loading = isLoading || leasesQuery.isLoading
  const errored = isError || leasesQuery.isError
  const leases = leasesQuery.data ?? []

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          A shared network groups one or more subnets under common options; DHCP leases are drawn
          from each subnet's configured ranges.
        </p>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className={`shrink-0 bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New network'}
        </button>
      </div>

      {showCreate && (
        <CreateNetworkForm
          existingNames={sharedNetworks.map((n) => n.name)}
          onDone={() => setShowCreate(false)}
        />
      )}

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {errored && <p className="text-sm text-danger-500">Failed to load DHCP configuration.</p>}

      <div className="space-y-3">
        {sharedNetworks.map((network) => (
          <NetworkCard key={network.name} network={network} leases={leases} />
        ))}
        {!loading && sharedNetworks.length === 0 && (
          <p className="text-sm text-slate-500">No shared networks configured yet.</p>
        )}
      </div>
    </div>
  )
}

function CreateNetworkForm({ existingNames, onDone }: { existingNames: string[]; onDone: () => void }) {
  const [name, setName] = useState('')
  const [cidr, setCidr] = useState('')
  const [subnetId, setSubnetId] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeStop, setRangeStop] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const nameTaken = existingNames.includes(trimmedName)
  const trimmedCidr = cidr.trim()
  const cidrValid = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(trimmedCidr)
  const valid = isValidVyOSIdentifier(trimmedName) && !nameTaken && cidrValid && subnetId.trim() !== ''

  function submit() {
    if (!valid) return
    const path = [...sharedNetworkPath(trimmedName), 'subnet', trimmedCidr, 'subnet-id']
    add({
      op: { op: 'set', path, value: subnetId.trim() },
      label: `set service dhcp-server shared-network-name ${trimmedName} subnet ${trimmedCidr} subnet-id '${subnetId.trim()}'`,
    })
    // VyOS refuses to commit a subnet with neither an address range nor
    // a static-mapping - and once this form's own op above is queued,
    // this subnet won't exist server-side until that commit succeeds,
    // so RangeList/StaticMappingSection (which only ever show already-
    // fetched, real subnets) have no way to add one before then either.
    // Queuing an initial range here, in the SAME commit, is what breaks
    // that deadlock - see docs/roadmap.md's DHCP entry.
    if (rangeStart.trim() && rangeStop.trim()) {
      const rangeBase = rangePath(trimmedName, trimmedCidr, '0')
      add({
        op: { op: 'set', path: [...rangeBase, 'start'], value: rangeStart.trim() },
        label: `set ... range 0 start '${rangeStart.trim()}'`,
      })
      add({
        op: { op: 'set', path: [...rangeBase, 'stop'], value: rangeStop.trim() },
        label: `set ... range 0 stop '${rangeStop.trim()}'`,
      })
    }
    onDone()
  }

  return (
    <div className="mb-4 rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="grid grid-cols-3 gap-3">
        <label className={labelClass}>
          Name
          <input
            {...noExtensionInputProps}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="LAN"
            className={inputClass}
          />
          {nameTaken && <span className="text-danger-500">network {trimmedName} already exists.</span>}
        </label>
        <label className={labelClass}>
          First subnet CIDR
          <input
            {...noExtensionInputProps}
            value={cidr}
            onChange={(e) => setCidr(e.target.value)}
            placeholder="192.168.1.0/24"
            className={inputClass}
          />
          {trimmedCidr !== '' && !cidrValid && <span className="text-danger-500">Must be a valid CIDR.</span>}
        </label>
        <label className={labelClass}>
          Subnet ID
          <input
            {...noExtensionInputProps}
            value={subnetId}
            onChange={(e) => setSubnetId(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="1"
            className={inputClass}
          />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className={labelClass}>
          First range start (optional)
          <input
            {...noExtensionInputProps}
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            placeholder="192.168.1.50"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          First range stop (optional)
          <input
            {...noExtensionInputProps}
            value={rangeStop}
            onChange={(e) => setRangeStop(e.target.value)}
            placeholder="192.168.1.250"
            className={inputClass}
          />
        </label>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        VyOS requires every subnet to have at least one address range or static mapping before it can
        be committed - fill these in now, or add a static mapping instead once this network exists (its
        own card lets you do either afterward, but the very first commit needs one of the two already
        present).
      </p>
      <button onClick={submit} disabled={!valid} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Queue network creation
      </button>
    </div>
  )
}
