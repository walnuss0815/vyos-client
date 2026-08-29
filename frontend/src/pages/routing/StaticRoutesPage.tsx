import { useState } from 'react'
import StaticRouteCard from '../../components/routing/StaticRouteCard'
import { useRoutingConfig } from '../../hooks/useRoutingConfig'
import { staticRoutePath } from '../../lib/routingParse'
import type { RouteFamily } from '../../lib/routingTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

export default function StaticRoutesPage() {
  const { staticRoutes, isLoading, isError } = useRoutingConfig()
  const [showCreate, setShowCreate] = useState(false)

  const ipv4Routes = staticRoutes.filter((r) => r.family === 'ipv4')
  const ipv6Routes = staticRoutes.filter((r) => r.family === 'ipv6')

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Manually configured paths to specific destinations - via a next-hop address, an
          outbound interface, a DHCP-derived gateway, or an explicit reject/blackhole.
        </p>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className={`shrink-0 bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New route'}
        </button>
      </div>

      {showCreate && (
        <CreateRouteForm
          existingDestinations={staticRoutes.map((r) => `${r.family} ${r.destination}`)}
          onDone={() => setShowCreate(false)}
        />
      )}

      {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {isError && <p className="text-sm text-danger-500">Failed to load routing configuration.</p>}

      <div className="space-y-8">
        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">
            IPv4 ({ipv4Routes.length})
          </h2>
          <div className="space-y-3">
            {ipv4Routes.map((route) => (
              <StaticRouteCard key={route.destination} route={route} />
            ))}
            {!isLoading && ipv4Routes.length === 0 && (
              <p className="text-sm text-slate-500">No IPv4 static routes configured yet.</p>
            )}
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">
            IPv6 ({ipv6Routes.length})
          </h2>
          <div className="space-y-3">
            {ipv6Routes.map((route) => (
              <StaticRouteCard key={route.destination} route={route} />
            ))}
            {!isLoading && ipv6Routes.length === 0 && (
              <p className="text-sm text-slate-500">No IPv6 static routes configured yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

type ViaKind = 'next-hop' | 'interface' | 'dhcp-interface' | 'reject' | 'blackhole'

const VIA_LABELS: Record<ViaKind, string> = {
  'next-hop': 'Next-hop address',
  interface: 'Interface',
  'dhcp-interface': 'DHCP interface',
  reject: 'Reject',
  blackhole: 'Blackhole',
}

function CreateRouteForm({
  existingDestinations,
  onDone,
}: {
  existingDestinations: string[]
  onDone: () => void
}) {
  const [family, setFamily] = useState<RouteFamily>('ipv4')
  const [destination, setDestination] = useState('')
  const [viaKind, setViaKind] = useState<ViaKind>('next-hop')
  const [viaValue, setViaValue] = useState('')
  const [distance, setDistance] = useState('')
  const [tag, setTag] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedDestination = destination.trim()
  // IPv4 gets a real CIDR regex (matching every other IPv4-CIDR field
  // in this app, e.g. DHCP's subnet creation); IPv6 CIDR validation is
  // deliberately looser (non-empty with a prefix length) rather than a
  // full address-format regex, consistent with how this codebase
  // generally favors light client-side validation and leaves full
  // correctness to VyOS's own commit-time checks.
  const destinationValid =
    family === 'ipv4'
      ? /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(trimmedDestination)
      : /^[0-9a-fA-F:]+\/\d{1,3}$/.test(trimmedDestination)
  const destinationTaken = existingDestinations.includes(`${family} ${trimmedDestination}`)
  const needsViaValue = viaKind === 'next-hop' || viaKind === 'interface' || viaKind === 'dhcp-interface'
  const needsDistance = viaKind !== 'dhcp-interface'
  const valid = destinationValid && !destinationTaken && (!needsViaValue || viaValue.trim() !== '')

  function submit() {
    if (!valid) return
    const base = staticRoutePath(family, trimmedDestination)
    const chain = family === 'ipv6' ? 'route6' : 'route'
    const pathLabel = `protocols static ${chain} ${trimmedDestination}`
    const trimmedDistance = distance.trim()
    const trimmedTag = tag.trim()

    if (viaKind === 'dhcp-interface') {
      add({
        op: { op: 'set', path: [...base, 'dhcp-interface'], value: viaValue.trim() },
        label: `set ${pathLabel} dhcp-interface '${viaValue.trim()}'`,
      })
    } else if (viaKind === 'reject' || viaKind === 'blackhole') {
      const viaPath = [...base, viaKind]
      add({ op: { op: 'set', path: viaPath }, label: `set ${pathLabel} ${viaKind}` })
      if (trimmedDistance) {
        add({
          op: { op: 'set', path: [...viaPath, 'distance'], value: trimmedDistance },
          label: `set ${pathLabel} ${viaKind} distance '${trimmedDistance}'`,
        })
      }
      if (trimmedTag) {
        add({
          op: { op: 'set', path: [...viaPath, 'tag'], value: trimmedTag },
          label: `set ${pathLabel} ${viaKind} tag '${trimmedTag}'`,
        })
      }
    } else {
      const entryPath = [...base, viaKind, viaValue.trim()]
      add({ op: { op: 'set', path: entryPath }, label: `set ${pathLabel} ${viaKind} ${viaValue.trim()}` })
      if (trimmedDistance) {
        add({
          op: { op: 'set', path: [...entryPath, 'distance'], value: trimmedDistance },
          label: `set ${pathLabel} ${viaKind} ${viaValue.trim()} distance '${trimmedDistance}'`,
        })
      }
    }
    onDone()
  }

  return (
    <div className="mb-4 rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className={labelClass}>
          Family
          <select
            value={family}
            onChange={(e) => setFamily(e.target.value as RouteFamily)}
            className={inputClass}
          >
            <option value="ipv4">IPv4</option>
            <option value="ipv6">IPv6</option>
          </select>
        </label>
        <label className={`${labelClass} col-span-2`}>
          Destination
          <input
            {...noExtensionInputProps}
            autoFocus
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder={family === 'ipv6' ? '2001:db8::/32' : '192.0.2.0/24'}
            className={inputClass}
          />
          {trimmedDestination !== '' && !destinationValid && (
            <span className="text-danger-500">Must be a valid CIDR.</span>
          )}
          {destinationTaken && (
            <span className="text-danger-500">This destination is already configured.</span>
          )}
        </label>
        <label className={labelClass}>
          Via
          <select
            value={viaKind}
            onChange={(e) => setViaKind(e.target.value as ViaKind)}
            className={inputClass}
          >
            {(Object.keys(VIA_LABELS) as ViaKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {VIA_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {needsViaValue && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={labelClass}>
            {viaKind === 'next-hop' ? 'Next-hop address' : 'Interface name'}
            <input
              {...noExtensionInputProps}
              value={viaValue}
              onChange={(e) => setViaValue(e.target.value)}
              placeholder={
                viaKind === 'next-hop' ? (family === 'ipv6' ? '2001:db8::1' : '10.0.0.254') : 'eth0'
              }
              className={inputClass}
            />
          </label>
          {needsDistance && (
            <label className={labelClass}>
              Distance (optional)
              <input
                {...noExtensionInputProps}
                value={distance}
                onChange={(e) => setDistance(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="1-255"
                className={inputClass}
              />
            </label>
          )}
        </div>
      )}

      {(viaKind === 'reject' || viaKind === 'blackhole') && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Distance (optional)
            <input
              {...noExtensionInputProps}
              value={distance}
              onChange={(e) => setDistance(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="1-255"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Tag (optional)
            <input
              {...noExtensionInputProps}
              value={tag}
              onChange={(e) => setTag(e.target.value.replace(/[^0-9]/g, ''))}
              className={inputClass}
            />
          </label>
        </div>
      )}

      <button onClick={submit} disabled={!valid} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Queue route creation
      </button>
    </div>
  )
}
