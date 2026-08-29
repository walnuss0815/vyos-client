import { useState } from 'react'
import ChipList from '../ChipList'
import { dnsForwardingDomainPath, dnsForwardingPath } from '../../lib/serviceDnsForwardingParse'
import {
  addNameServerOps,
  blankDNSForwardingSettingsFormValues,
  deleteDNSForwardingDomainOp,
  disableDNSForwardingOp,
  dnsForwardingConfigToFormValues,
  dnsForwardingDomainFormToOps,
  dnsForwardingSettingsFormToOps,
  enableDNSForwardingOp,
  removeNameServerOp,
} from '../../lib/serviceDnsForwardingForm'
import {
  DNS_FORWARDING_DNSSEC_MODES,
  type DNSForwardingConfig,
  type DNSForwardingDomain,
} from '../../lib/serviceDnsForwardingTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function DnsForwardingSettings({ config }: { config: DNSForwardingConfig }) {
  const add = usePendingChangesStore((s) => s.add)

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">DNS forwarding is not configured.</p>
        <button
          onClick={() => {
            const op = enableDNSForwardingOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable DNS forwarding
        </button>
      </div>
    )
  }

  return <DnsForwardingSettingsForm config={config} />
}

function DnsForwardingSettingsForm({ config }: { config: DNSForwardingConfig }) {
  const [values, setValues] = useState(() => dnsForwardingConfigToFormValues(config))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankDNSForwardingSettingsFormValues>>(
    key: K,
    value: ReturnType<typeof blankDNSForwardingSettingsFormValues>[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = dnsForwardingSettingsFormToOps(config, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  function queueDisable() {
    const op = disableDNSForwardingOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-3 gap-3">
          <FieldLabel label="Cache size" hint="Maximum number of answers kept in the resolver's cache, not a byte size - once full, older entries are evicted to make room for new ones.">
            <input {...noExtensionInputProps} value={values.cacheSize} onChange={(e) => update('cacheSize', e.target.value)} placeholder="10000" className={inputClass} />
          </FieldLabel>
          <FieldLabel
            label="DNSSEC mode"
            hint="Whether and how to validate DNSSEC signatures on answers - process-no-validate forwards the security data without checking it itself, leaving validation to the client."
          >
            <select value={values.dnssec} onChange={(e) => update('dnssec', e.target.value)} className={inputClass}>
              <option value="">Default (process-no-validate)</option>
              {DNS_FORWARDING_DNSSEC_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel label="Negative TTL (s)" hint="How long a 'this name doesn't exist' (NXDOMAIN) answer is cached before being re-checked with the upstream server.">
            <input {...noExtensionInputProps} value={values.negativeTtl} onChange={(e) => update('negativeTtl', e.target.value)} placeholder="3600" className={inputClass} />
          </FieldLabel>
          <label className={labelClass}>
            Listen port
            <input {...noExtensionInputProps} value={values.port} onChange={(e) => update('port', e.target.value)} placeholder="53" className={inputClass} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.useSystemNameServers} onChange={(e) => update('useSystemNameServers', e.target.checked)} className="accent-accent-500" />
            Also use system name servers (/etc/resolv.conf)
            <InfoTooltip text="Adds the router's own upstream resolvers (e.g. from DHCP on an uplink interface) to the forwarders list below, instead of relying only on manually-configured ones." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.ignoreHostsFile} onChange={(e) => update('ignoreHostsFile', e.target.checked)} className="accent-accent-500" />
            Ignore /etc/hosts
            <InfoTooltip text="Normally static host mappings (configured on the System tab) are also served by this resolver - this stops that, so only forwarded/cached answers are returned." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.noServeRfc1918} onChange={(e) => update('noServeRfc1918', e.target.checked)} className="accent-accent-500" />
            Don't serve RFC1918 reverse zones
            <InfoTooltip text="By default this resolver answers reverse-DNS lookups for private address ranges (10/8, 172.16/12, 192.168/16) with NXDOMAIN rather than forwarding them upstream - this disables that shortcut." />
          </label>
        </div>
        <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
          Save settings
        </button>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">DHCP interfaces</p>
            <ChipList values={config.dhcpInterfaces} basePath={dnsForwardingPath()} leaf="dhcp" pathLabel="service dns forwarding dhcp" placeholder="eth0" />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Allowed clients</p>
            <ChipList values={config.allowFrom} basePath={dnsForwardingPath()} leaf="allow-from" pathLabel="service dns forwarding allow-from" placeholder="192.0.2.0/24" />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Listen addresses</p>
            <ChipList values={config.listenAddresses} basePath={dnsForwardingPath()} leaf="listen-address" pathLabel="service dns forwarding listen-address" placeholder="192.0.2.1" />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Source addresses</p>
            <ChipList values={config.sourceAddresses} basePath={dnsForwardingPath()} leaf="source-address" pathLabel="service dns forwarding source-address" placeholder="192.0.2.1" />
          </div>
        </div>
      </div>

      <NameServersSection title="Upstream forwarders" base={dnsForwardingPath('name-server')} nameServers={config.forwarders} />

      <DomainsSection config={config} />

      <div>
        <button onClick={queueDisable} className="text-xs text-danger-500 hover:text-danger-400">
          Disable DNS forwarding entirely
        </button>
      </div>
    </div>
  )
}

function NameServersSection({
  title,
  base,
  nameServers,
}: {
  title: string
  base: string[]
  nameServers: { address: string; port?: string }[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [address, setAddress] = useState('')
  const [port, setPort] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedAddress = address.trim()
  const taken = nameServers.some((ns) => ns.address === trimmedAddress)
  const valid = trimmedAddress !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addNameServerOps(base, trimmedAddress, port)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setAddress('')
    setPort('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          {title} ({nameServers.length})
        </h2>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 flex items-center gap-2">
          <input {...noExtensionInputProps} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="8.8.8.8" className={inputClass} />
          <input {...noExtensionInputProps} value={port} onChange={(e) => setPort(e.target.value)} placeholder="port (optional, default 53)" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          {taken && <p className="text-xs text-danger-500">Already configured.</p>}
        </div>
      )}
      <div className="space-y-1">
        {nameServers.map((ns) => (
          <div key={ns.address} className="flex items-center justify-between rounded border border-surface-border p-2">
            <span className="font-mono text-xs text-slate-300">
              {ns.address}
              {ns.port && <span className="text-slate-500">:{ns.port}</span>}
            </span>
            <button
              onClick={() => {
                const op = removeNameServerOp(base, ns.address)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
        ))}
        {nameServers.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      </div>
    </div>
  )
}

function DomainsSection({ config }: { config: DNSForwardingConfig }) {
  const [showCreate, setShowCreate] = useState(false)
  const [fqdn, setFqdn] = useState('')
  const [addnta, setAddnta] = useState(false)
  const [recursionDesired, setRecursionDesired] = useState(false)
  const [expandedFqdn, setExpandedFqdn] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const trimmedFqdn = fqdn.trim()
  const taken = config.domains.some((d) => d.fqdn === trimmedFqdn)
  const valid = trimmedFqdn !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = dnsForwardingDomainFormToOps(trimmedFqdn, undefined, { addnta, recursionDesired })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setFqdn('')
    setAddnta(false)
    setRecursionDesired(false)
    setShowCreate(false)
  }

  function queueDelete(domainFqdn: string) {
    const op = deleteDNSForwardingDomainOp(domainFqdn)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Per-domain forwarders ({config.domains.length})
        </h2>
        <button onClick={() => setShowCreate((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showCreate ? 'Cancel' : '+ New domain'}
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Queries for a specific domain are forwarded to its own set of servers instead of the
        upstream forwarders above - useful for split-horizon DNS or internal-only zones.
      </p>

      {showCreate && (
        <div className="mb-3 space-y-2 rounded-xl border border-surface-border bg-surface-900 p-4">
          <input {...noExtensionInputProps} autoFocus value={fqdn} onChange={(e) => setFqdn(e.target.value)} placeholder="internal.example.com" className={`w-full ${inputClass}`} />
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input type="checkbox" checked={addnta} onChange={(e) => setAddnta(e.target.checked)} className="accent-accent-500" />
              Add negative trust anchor (no DNSSEC)
              <InfoTooltip text="Tells the resolver not to expect or require DNSSEC signatures for this domain - needed for internal zones that aren't signed, so they don't fail validation." />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input type="checkbox" checked={recursionDesired} onChange={(e) => setRecursionDesired(e.target.checked)} className="accent-accent-500" />
              Recursion desired
              <InfoTooltip text="Sets the RD flag on queries forwarded to this domain's servers, asking them to fully resolve the answer themselves rather than only returning what they know directly." />
            </label>
          </div>
          {taken && <p className="text-xs text-danger-500">This domain is already configured.</p>}
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add domain
          </button>
        </div>
      )}

      <div className="space-y-3">
        {config.domains.map((domain) => (
          <div key={domain.fqdn} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-white">{domain.fqdn}</span>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setExpandedFqdn((f) => (f === domain.fqdn ? null : domain.fqdn))} className="text-accent-500 hover:text-accent-400">
                  {expandedFqdn === domain.fqdn ? 'Hide' : 'Name servers'}
                </button>
                <button onClick={() => queueDelete(domain.fqdn)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
            {expandedFqdn === domain.fqdn && <DomainNameServers domain={domain} />}
          </div>
        ))}
        {config.domains.length === 0 && <p className="text-xs text-slate-500">No per-domain forwarders configured.</p>}
      </div>
    </div>
  )
}

function DomainNameServers({ domain }: { domain: DNSForwardingDomain }) {
  return (
    <div className="mt-3 border-t border-surface-border pt-3">
      <NameServersSection
        title="Name servers"
        base={dnsForwardingDomainPath(domain.fqdn, 'name-server')}
        nameServers={domain.nameServers}
      />
    </div>
  )
}
