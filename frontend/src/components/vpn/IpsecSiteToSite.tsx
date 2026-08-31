import { useState } from 'react'
import ChipList from '../ChipList'
import { ipsecPeerPath } from '../../lib/vpnIpsecParse'
import {
  addTunnelOps,
  blankPeerFormValues,
  deletePeerOp,
  peerFormToOps,
  peerToFormValues,
  removeTunnelOp,
  type PeerFormValues,
} from '../../lib/vpnIpsecForm'
import {
  IPSEC_CHILDLESS_OPTIONS,
  IPSEC_CONNECTION_TYPES,
  IPSEC_IKEV2_REAUTH_OPTIONS,
  IPSEC_PEER_AUTH_MODES,
  type IPsecConfig,
  type IPsecPeer,
} from '../../lib/vpnIpsecTypes'
import FieldLabel from '../FieldLabel'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

export default function IpsecSiteToSite({ config }: { config: IPsecConfig }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [expandedName, setExpandedName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(name: string) {
    const op = deletePeerOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? config.siteToSitePeers.find((p) => p.name === editingName) : undefined

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Peers ({config.siteToSitePeers.length})
        </h2>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingName(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New peer'}
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        For pre-shared-secret authentication, add the peer's local/remote ID to a matching entry
        on the Crypto Groups tab's pre-shared keys section - it isn't set on the peer itself.
      </p>

      {showCreate && (
        <div className="mb-3">
          <PeerForm existingNames={config.siteToSitePeers.map((p) => p.name)} espGroups={config.espGroups.map((g) => g.name)} ikeGroups={config.ikeGroups.map((g) => g.name)} onDone={() => setShowCreate(false)} />
        </div>
      )}
      {editing && (
        <div className="mb-3">
          <PeerForm peer={editing} existingNames={config.siteToSitePeers.map((p) => p.name)} espGroups={config.espGroups.map((g) => g.name)} ikeGroups={config.ikeGroups.map((g) => g.name)} onDone={() => setEditingName(null)} />
        </div>
      )}

      <div className="space-y-3">
        {config.siteToSitePeers.map((peer) => (
          <div key={peer.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-sm font-medium text-white">{peer.name}</span>
                {peer.disabled && (
                  <span className="ml-2 rounded bg-danger-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-danger-500">disabled</span>
                )}
                <p className="text-xs text-slate-400">
                  {peer.description || 'no description set'}
                  {peer.remoteAddresses.length > 0 && ` · ${peer.remoteAddresses.join(', ')}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button onClick={() => setExpandedName((n) => (n === peer.name ? null : peer.name))} className="text-accent-500 hover:text-accent-400">
                  {expandedName === peer.name ? 'Hide details' : 'Details'}
                </button>
                <button
                  onClick={() => {
                    setEditingName(peer.name)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(peer.name)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
            {expandedName === peer.name && <PeerDetails peer={peer} />}
          </div>
        ))}
        {config.siteToSitePeers.length === 0 && <p className="text-xs text-slate-500">No site-to-site peers configured yet.</p>}
      </div>
    </div>
  )
}

function PeerForm({
  peer,
  existingNames,
  espGroups,
  ikeGroups,
  onDone,
}: {
  peer?: IPsecPeer
  existingNames: string[]
  espGroups: string[]
  ikeGroups: string[]
  onDone: () => void
}) {
  const [name, setName] = useState(peer?.name ?? '')
  const [remoteAddress, setRemoteAddress] = useState(peer?.remoteAddresses[0] ?? '')
  const [values, setValues] = useState<PeerFormValues>(peer ? peerToFormValues(peer) : blankPeerFormValues())
  const [firstTunnelId, setFirstTunnelId] = useState('')
  const [firstTunnelLocalPrefix, setFirstTunnelLocalPrefix] = useState('')
  const [firstTunnelRemotePrefix, setFirstTunnelRemotePrefix] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = peer === undefined
  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof PeerFormValues>(key: K, value: PeerFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = peerFormToOps(trimmedName, peer, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    if (isCreate && remoteAddress.trim()) {
      const path = [...ipsecPeerPath(trimmedName), 'remote-address']
      add({ op: { op: 'set', path, value: remoteAddress.trim() }, label: `set ${path.join(' ')} '${remoteAddress.trim()}'` })
    }
    // A peer's tunnels (traffic selectors) used to only be addable
    // AFTER the peer already existed - TunnelsSection only ever
    // operates on an already-fetched peer. Not a VyOS commit-blocking
    // requirement, but avoids a detour through commit+refetch just to
    // add the first one.
    const trimmedTunnelId = firstTunnelId.trim()
    if (isCreate && trimmedTunnelId) {
      const tunnelOps = addTunnelOps(trimmedName, trimmedTunnelId, { espGroup: '', protocol: '' })
      for (const op of tunnelOps) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
      const base = [...ipsecPeerPath(trimmedName), 'tunnel', trimmedTunnelId]
      if (firstTunnelLocalPrefix.trim()) {
        add({
          op: { op: 'set', path: [...base, 'local', 'prefix'], value: firstTunnelLocalPrefix.trim() },
          label: `set ${base.join(' ')} local prefix '${firstTunnelLocalPrefix.trim()}'`,
        })
      }
      if (firstTunnelRemotePrefix.trim()) {
        add({
          op: { op: 'set', path: [...base, 'remote', 'prefix'], value: firstTunnelRemotePrefix.trim() },
          label: `set ${base.join(' ')} remote prefix '${firstTunnelRemotePrefix.trim()}'`,
        })
      }
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">{isCreate ? 'New peer' : `Edit ${peer.name}`}</h3>
      <div className="grid grid-cols-3 gap-3">
        <label className={labelClass}>
          Name *
          <input {...noExtensionInputProps} autoFocus disabled={!isCreate} value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} disabled:opacity-60`} />
          {nameTaken && <span className="text-danger-500">This peer already exists.</span>}
        </label>
        {isCreate && (
          <label className={labelClass}>
            Remote address
            <input {...noExtensionInputProps} value={remoteAddress} onChange={(e) => setRemoteAddress(e.target.value)} placeholder="203.0.113.1 or any" className={inputClass} />
          </label>
        )}
        <label className={labelClass}>
          Local address
          <input {...noExtensionInputProps} value={values.localAddress} onChange={(e) => update('localAddress', e.target.value)} placeholder="192.0.2.1 or any" className={inputClass} />
        </label>
        <label className={labelClass}>
          Description
          <input {...noExtensionInputProps} value={values.description} onChange={(e) => update('description', e.target.value)} className={inputClass} />
        </label>
        <FieldLabel
          label="Connection type"
          hint="Who initiates: 'initiate' actively starts the tunnel, 'respond' only answers incoming connections, 'none' loads the config without connecting at all."
        >
          <select value={values.connectionType} onChange={(e) => update('connectionType', e.target.value)} className={inputClass}>
            <option value="">Select…</option>
            {IPSEC_CONNECTION_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </FieldLabel>
        <label className={labelClass}>
          Default ESP group
          <select value={values.defaultEspGroup} onChange={(e) => update('defaultEspGroup', e.target.value)} className={inputClass}>
            <option value="">Select…</option>
            {espGroups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          IKE group
          <select value={values.ikeGroup} onChange={(e) => update('ikeGroup', e.target.value)} className={inputClass}>
            <option value="">Select…</option>
            {ikeGroups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <FieldLabel
          label="Authentication mode"
          hint="How this peer proves its identity - a pre-shared secret (see the Crypto Groups tab), an RSA key pair, or an x509 certificate."
        >
          <select value={values.authMode} onChange={(e) => update('authMode', e.target.value)} className={inputClass}>
            <option value="">Select…</option>
            {IPSEC_PEER_AUTH_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </FieldLabel>
        <label className={labelClass}>
          Local ID
          <input {...noExtensionInputProps} value={values.localId} onChange={(e) => update('localId', e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Remote ID
          <input {...noExtensionInputProps} value={values.remoteId} onChange={(e) => update('remoteId', e.target.value)} className={inputClass} />
        </label>
        <FieldLabel
          label="IKEv2 re-auth"
          hint="Whether to fully re-verify the peer's identity on each re-key, instead of just refreshing session keys - stronger, but interrupts long-lived tunnels briefly."
        >
          <select value={values.ikev2Reauth} onChange={(e) => update('ikev2Reauth', e.target.value)} className={inputClass}>
            <option value="">Select…</option>
            {IPSEC_IKEV2_REAUTH_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel
          label="Childless IKEv2"
          hint="Allows the initial IKE SA to come up without an IPsec child SA attached yet - some client implementations require this."
        >
          <select value={values.childless} onChange={(e) => update('childless', e.target.value)} className={inputClass}>
            <option value="">Select…</option>
            {IPSEC_CHILDLESS_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </FieldLabel>
        <label className={labelClass}>
          Replay window
          <input {...noExtensionInputProps} value={values.replayWindow} onChange={(e) => update('replayWindow', e.target.value)} placeholder="32" className={inputClass} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.disabled} onChange={(e) => update('disabled', e.target.checked)} className="accent-accent-500" />
          Disable this peer
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.useX509Id} onChange={(e) => update('useX509Id', e.target.checked)} className="accent-accent-500" />
          Use certificate CN as ID
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.forceUdpEncapsulation} onChange={(e) => update('forceUdpEncapsulation', e.target.checked)} className="accent-accent-500" />
          Force UDP encapsulation
        </label>
      </div>

      {isCreate && (
        <div className="mt-3 border-t border-surface-border pt-3">
          <p className="mb-2 text-xs text-slate-500">First tunnel (optional)</p>
          <div className="grid grid-cols-3 gap-3">
            <label className={labelClass}>
              Tunnel #
              <input {...noExtensionInputProps} value={firstTunnelId} onChange={(e) => setFirstTunnelId(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" className={inputClass} />
            </label>
            <label className={labelClass}>
              Local prefix
              <input {...noExtensionInputProps} value={firstTunnelLocalPrefix} onChange={(e) => setFirstTunnelLocalPrefix(e.target.value)} placeholder="192.168.1.0/24" className={inputClass} />
            </label>
            <label className={labelClass}>
              Remote prefix
              <input {...noExtensionInputProps} value={firstTunnelRemotePrefix} onChange={(e) => setFirstTunnelRemotePrefix(e.target.value)} placeholder="10.0.0.0/24" className={inputClass} />
            </label>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
      </div>
    </div>
  )
}

function PeerDetails({ peer }: { peer: IPsecPeer }) {
  return (
    <div className="mt-3 space-y-3 border-t border-surface-border pt-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs text-slate-500">Remote addresses</p>
          <ChipList values={peer.remoteAddresses} basePath={ipsecPeerPath(peer.name)} leaf="remote-address" pathLabel={`vpn ipsec site-to-site peer ${peer.name} remote-address`} placeholder="203.0.113.1" />
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500">Virtual addresses</p>
          <ChipList values={peer.virtualAddresses} basePath={ipsecPeerPath(peer.name)} leaf="virtual-address" pathLabel={`vpn ipsec site-to-site peer ${peer.name} virtual-address`} placeholder="10.0.0.1" />
        </div>
      </div>
      <TunnelsSection peer={peer} />
    </div>
  )
}

function TunnelsSection({ peer }: { peer: IPsecPeer }) {
  const [showAdd, setShowAdd] = useState(false)
  const [id, setId] = useState('')
  const [espGroup, setEspGroup] = useState('')
  const [protocol, setProtocol] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedId = id.trim()
  const taken = peer.tunnels.some((t) => t.id === trimmedId)
  const valid = trimmedId !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addTunnelOps(peer.name, trimmedId, { espGroup, protocol })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setId('')
    setEspGroup('')
    setProtocol('')
    setShowAdd(false)
  }

  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">Tunnels (traffic selectors)</p>
      {peer.tunnels.map((tunnel) => (
        <div key={tunnel.id} className="mb-2 rounded border border-surface-border p-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-slate-300">
              {tunnel.id}
              {tunnel.espGroup && ` (${tunnel.espGroup})`}
            </span>
            <button
              onClick={() => {
                const op = removeTunnelOp(peer.name, tunnel.id)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <ChipList values={tunnel.localPrefixes} basePath={[...ipsecPeerPath(peer.name), 'tunnel', tunnel.id, 'local']} leaf="prefix" pathLabel={`... tunnel ${tunnel.id} local prefix`} placeholder="192.168.1.0/24 (local)" />
            <ChipList values={tunnel.remotePrefixes} basePath={[...ipsecPeerPath(peer.name), 'tunnel', tunnel.id, 'remote']} leaf="prefix" pathLabel={`... tunnel ${tunnel.id} remote prefix`} placeholder="10.0.0.0/24 (remote)" />
          </div>
        </div>
      ))}
      {peer.tunnels.length === 0 && <p className="text-xs text-slate-500">No tunnels configured.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add tunnel'}
      </button>
      {showAdd && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <input {...noExtensionInputProps} value={id} onChange={(e) => setId(e.target.value.replace(/[^0-9]/g, ''))} placeholder="tunnel #" className={inputClass} />
          <input {...noExtensionInputProps} value={espGroup} onChange={(e) => setEspGroup(e.target.value)} placeholder="esp-group override (optional)" className={inputClass} />
          <input {...noExtensionInputProps} value={protocol} onChange={(e) => setProtocol(e.target.value)} placeholder="protocol (optional)" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>Add tunnel</button>
          {taken && <p className="col-span-3 text-xs text-danger-500">This tunnel number is already used.</p>}
        </div>
      )}
    </div>
  )
}
