import { useState } from 'react'
import {
  blankPeerFormValues,
  peerFormToOps,
  peerToFormValues,
  type BGPAddressFamilyFormValues,
  type BGPPeerFormValues,
} from '../../lib/bgpPeerForm'
import { bgpPeerPath } from '../../lib/bgpParse'
import type { BGPPeer, BGPPeerKind } from '../../lib/bgpTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

type Tab = 'basic' | 'ipv4' | 'ipv6'

interface BGPPeerFormProps {
  kind: BGPPeerKind
  /** undefined = creating a new neighbor/peer-group. */
  peer?: BGPPeer
  existingIdentifiers: string[]
  /** Names of configured peer-groups, for the neighbor-only
   * "assign to peer-group" select. Ignored when kind === 'peer-group'
   * (a peer-group can't itself be assigned to another peer-group). */
  peerGroupNames: string[]
  onDone: () => void
}

/** Shared create/edit form for both BGP neighbors and peer-groups -
 * they take the same field set (VyOS applies a neighbor's own setting
 * over whatever it inherits from its peer-group), so one component
 * handles both, parametrized by `kind`. Mirrors RuleForm.tsx's
 * tabbed-sections structure. */
export default function BGPPeerForm({
  kind,
  peer,
  existingIdentifiers,
  peerGroupNames,
  onDone,
}: BGPPeerFormProps) {
  const [tab, setTab] = useState<Tab>('basic')
  const [identifier, setIdentifier] = useState(peer?.identifier ?? '')
  const [values, setValues] = useState<BGPPeerFormValues>(
    peer ? peerToFormValues(peer) : blankPeerFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = peer === undefined
  const trimmedIdentifier = identifier.trim()
  const identifierTaken = isCreate && existingIdentifiers.includes(trimmedIdentifier)
  const canSubmit = trimmedIdentifier !== '' && !identifierTaken && values.remoteAs.trim() !== ''
  const noun = kind === 'neighbor' ? 'neighbor' : 'peer-group'

  function update<K extends keyof BGPPeerFormValues>(key: K, value: BGPPeerFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function updateAF(
    family: 'ipv4Unicast' | 'ipv6Unicast',
    key: keyof BGPAddressFamilyFormValues,
    value: BGPAddressFamilyFormValues[keyof BGPAddressFamilyFormValues],
  ) {
    setValues((v) => ({ ...v, [family]: { ...v[family], [key]: value } }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = peerFormToOps(kind, trimmedIdentifier, peer, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  function queueRemovePassword() {
    if (!peer) return
    add({
      op: { op: 'delete', path: bgpPeerPath(kind, peer.identifier, 'password') },
      label: `delete protocols bgp ${kind} ${peer.identifier} password`,
    })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">
          {isCreate ? `New ${noun}` : `Edit ${noun} ${peer.identifier}`}
        </h3>
        <div className="flex gap-1 rounded-lg border border-surface-border bg-surface-800 p-0.5 text-xs">
          {(['basic', 'ipv4', 'ipv6'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2 py-1 font-medium uppercase ${
                tab === t ? 'bg-accent-600 text-white' : 'text-slate-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'basic' && (
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            {kind === 'neighbor' ? 'Address / interface *' : 'Peer-group name *'}
            <input
              {...noExtensionInputProps}
              autoFocus
              disabled={!isCreate}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={kind === 'neighbor' ? '192.0.2.2' : 'UPSTREAM'}
              className={`${inputClass} disabled:opacity-60`}
            />
            {identifierTaken && (
              <span className="text-danger-500">This {noun} already exists.</span>
            )}
          </label>
          <FieldLabel
            label="Remote AS *"
            hint="The autonomous-system number this neighbor belongs to - a literal number, or 'external'/'internal' to accept any AS other than/matching this router's own, or 'auto' to detect it from the session."
          >
            <input
              {...noExtensionInputProps}
              value={values.remoteAs}
              onChange={(e) => update('remoteAs', e.target.value)}
              placeholder="64513, external, internal, or auto"
              className={inputClass}
            />
          </FieldLabel>
          <label className={`${labelClass} col-span-2`}>
            Description
            <input
              {...noExtensionInputProps}
              value={values.description}
              onChange={(e) => update('description', e.target.value)}
              className={inputClass}
            />
          </label>
          {kind === 'neighbor' && (
            <FieldLabel
              label="Peer-group"
              hint="Inherits settings from a named group defined elsewhere on this page - any setting given directly on this neighbor still overrides what it inherits from there."
            >
              <select
                value={values.peerGroup}
                onChange={(e) => update('peerGroup', e.target.value)}
                className={inputClass}
              >
                <option value="">(none)</option>
                {peerGroupNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </FieldLabel>
          )}
          <FieldLabel
            label="EBGP multihop TTL"
            hint="Allows an external-BGP session to a neighbor that isn't directly connected, by raising the number of router hops the session's packets are allowed to traverse."
          >
            <input
              {...noExtensionInputProps}
              value={values.ebgpMultihop}
              onChange={(e) => update('ebgpMultihop', e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="1-255"
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel
            label="Update source"
            hint="Fixes the local address this router uses for the session's TCP connection - needed when peering from a loopback/virtual address rather than a directly-connected interface."
          >
            <input
              {...noExtensionInputProps}
              value={values.updateSource}
              onChange={(e) => update('updateSource', e.target.value)}
              placeholder="source address or interface"
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel
            label="Password"
            hint="A shared secret used for TCP MD5 session authentication with this neighbor - not a login credential, just protects the BGP session itself from being spoofed/hijacked."
          >
            {!isCreate && peer.hasPassword ? '(configured - leave blank to keep)' : ''}
            <input
              {...noExtensionInputProps}
              type="password"
              value={values.password}
              onChange={(e) => update('password', e.target.value)}
              placeholder={!isCreate && peer.hasPassword ? '••••••••' : 'MD5 session password'}
              className={inputClass}
            />
            {!isCreate && peer.hasPassword && (
              <button
                type="button"
                onClick={queueRemovePassword}
                className="self-start text-danger-500 hover:text-danger-400"
              >
                Remove password
              </button>
            )}
          </FieldLabel>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.shutdown}
              onChange={(e) => update('shutdown', e.target.checked)}
              className="accent-accent-500"
            />
            Shut down (administratively disable)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.passive}
              onChange={(e) => update('passive', e.target.checked)}
              className="accent-accent-500"
            />
            Passive (never initiate the session)
            <InfoTooltip text="This router only accepts an incoming connection from the neighbor and never tries to initiate one itself - useful when the neighbor's address is unstable or the neighbor should always connect first." />
          </label>
        </div>
      )}

      {(tab === 'ipv4' || tab === 'ipv6') && (
        <AddressFamilyFields
          values={tab === 'ipv4' ? values.ipv4Unicast : values.ipv6Unicast}
          onChange={(key, value) => updateAF(tab === 'ipv4' ? 'ipv4Unicast' : 'ipv6Unicast', key, value)}
        />
      )}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? `Queue ${noun} creation` : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}

function AddressFamilyFields({
  values,
  onChange,
}: {
  values: BGPAddressFamilyFormValues
  onChange: <K extends keyof BGPAddressFamilyFormValues>(
    key: K,
    value: BGPAddressFamilyFormValues[K],
  ) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={values.nexthopSelf}
          onChange={(e) => onChange('nexthopSelf', e.target.checked)}
          className="accent-accent-500"
        />
        Next-hop self
        <InfoTooltip text="Rewrites the next-hop this router advertises to this neighbor to its own address, instead of passing through the original next-hop - common on eBGP sessions where the peer can't otherwise reach it." />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={values.removePrivateAs}
          onChange={(e) => onChange('removePrivateAs', e.target.checked)}
          className="accent-accent-500"
        />
        Remove private AS
        <InfoTooltip text="Strips reserved/private autonomous-system numbers from the AS-path before advertising routes to this neighbor - avoids leaking internal AS numbering onto the public internet." />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={values.softReconfigurationInbound}
          onChange={(e) => onChange('softReconfigurationInbound', e.target.checked)}
          className="accent-accent-500"
        />
        Soft-reconfiguration inbound
        <InfoTooltip text="Keeps a stored copy of every route received from this neighbor (unfiltered), so inbound policy changes can be re-applied without resetting the session to re-request them." />
      </label>
      <FieldLabel
        label="Maximum prefix"
        hint="Tears down (or, depending on VyOS defaults, warns about) the session if this neighbor ever advertises more prefixes than this limit - a safety net against a misbehaving or compromised peer."
      >
        <input
          {...noExtensionInputProps}
          value={values.maximumPrefix}
          onChange={(e) => onChange('maximumPrefix', e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="unlimited"
          className={inputClass}
        />
      </FieldLabel>
    </div>
  )
}
