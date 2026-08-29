import { useState } from 'react'
import BGPPeerForm from './BGPPeerForm'
import { bgpPeerPath } from '../../lib/bgpParse'
import type { BGPPeer, BGPPeerKind } from '../../lib/bgpTypes'
import { buttonClass } from '../../lib/formStyles'
import { usePendingChangesStore } from '../../store/pendingChanges'

interface BGPPeerListProps {
  kind: BGPPeerKind
  peers: BGPPeer[]
  peerGroupNames: string[]
  isLoading: boolean
}

/** List of BGP neighbors or peer-groups (same component for both,
 * parametrized by `kind` - mirrors StaticRoutesPage.tsx's
 * list-plus-toggleable-forms structure, and BGPPeerForm.tsx's own
 * neighbor/peer-group sharing). */
export default function BGPPeerList({ kind, peers, peerGroupNames, isLoading }: BGPPeerListProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)
  const noun = kind === 'neighbor' ? 'neighbor' : 'peer-group'
  const nounPlural = kind === 'neighbor' ? 'neighbors' : 'peer-groups'

  function queueDelete(identifier: string) {
    add({
      op: { op: 'delete', path: bgpPeerPath(kind, identifier) },
      label: `delete protocols bgp ${kind} ${identifier}`,
    })
  }

  const editing = editingId ? peers.find((p) => p.identifier === editingId) : undefined

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          {nounPlural[0].toUpperCase() + nounPlural.slice(1)} ({peers.length})
        </h2>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingId(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : `+ New ${noun}`}
        </button>
      </div>

      {showCreate && (
        <div className="mb-3">
          <BGPPeerForm
            kind={kind}
            existingIdentifiers={peers.map((p) => p.identifier)}
            peerGroupNames={peerGroupNames}
            onDone={() => setShowCreate(false)}
          />
        </div>
      )}

      {editing && (
        <div className="mb-3">
          <BGPPeerForm
            kind={kind}
            peer={editing}
            existingIdentifiers={peers.map((p) => p.identifier)}
            peerGroupNames={peerGroupNames}
            onDone={() => setEditingId(null)}
          />
        </div>
      )}

      <div className="space-y-2">
        {peers.map((peer) => (
          <div
            key={peer.identifier}
            className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-900 px-3 py-2"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-white">{peer.identifier}</span>
                {peer.shutdown && (
                  <span className="rounded bg-danger-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-danger-500">
                    shutdown
                  </span>
                )}
                {peer.passive && (
                  <span className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-400">
                    passive
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {peer.remoteAs ? `AS ${peer.remoteAs}` : 'no remote-as set'}
                {peer.peerGroup && <span> · peer-group {peer.peerGroup}</span>}
                {peer.description && <span> · {peer.description}</span>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  setEditingId(peer.identifier)
                  setShowCreate(false)
                }}
                className="text-xs text-accent-500 hover:text-accent-400"
              >
                Edit
              </button>
              <button
                onClick={() => queueDelete(peer.identifier)}
                className="text-xs text-slate-500 hover:text-danger-500"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {!isLoading && peers.length === 0 && (
          <p className="text-xs text-slate-500">No {nounPlural} configured yet.</p>
        )}
      </div>
    </div>
  )
}
