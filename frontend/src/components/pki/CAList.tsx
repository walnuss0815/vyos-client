import { useState } from 'react'
import CAForm from './CAForm'
import ExpiryBadge from './ExpiryBadge'
import ChipList from '../ChipList'
import { usePKIExpiry } from '../../hooks/usePKIExpiry'
import { deleteCAOp } from '../../lib/pkiCAForm'
import { pkiCAPath } from '../../lib/pkiParse'
import type { PKICertificateAuthority } from '../../lib/pkiTypes'
import { buttonClass } from '../../lib/formStyles'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

export default function CAList({ cas, isLoading }: { cas: PKICertificateAuthority[]; isLoading: boolean }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)
  const { cas: expiry } = usePKIExpiry()

  function queueDelete(name: string) {
    const op = deleteCAOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? cas.find((c) => c.name === editingName) : undefined

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Certificate Authorities - paste in a CA certificate (and, if you use VyOS as your own
          issuer, its private key) obtained elsewhere or generated via the CLI's{' '}
          <code>generate pki ca</code> command.
        </p>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingName(null)
          }}
          className={`shrink-0 bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New CA'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-4">
          <CAForm existingNames={cas.map((c) => c.name)} onDone={() => setShowCreate(false)} />
        </div>
      )}

      {editing && (
        <div className="mb-4">
          <CAForm ca={editing} existingNames={cas.map((c) => c.name)} onDone={() => setEditingName(null)} />
        </div>
      )}

      <div className="space-y-3">
        {cas.map((ca) => (
          <div key={ca.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-white">{ca.name}</span>
                  {ca.revoked && (
                    <span className="rounded bg-danger-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-danger-500">
                      revoked
                    </span>
                  )}
                  {ca.hasPrivateKey && (
                    <span className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-400">
                      has private key
                    </span>
                  )}
                  <ExpiryBadge entry={expiry.get(ca.name)} />
                </div>
                {ca.description && <p className="text-xs text-slate-400">{ca.description}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button
                  onClick={() => {
                    setEditingName(ca.name)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(ca.name)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs text-slate-500">
                Certificate revocation lists (CRL)
                <InfoTooltip text="A list this CA publishes naming certificates it has revoked before their expiry - services can check it to reject a certificate that's still technically valid but shouldn't be trusted anymore." />
              </p>
              <ChipList
                values={ca.crls}
                basePath={pkiCAPath(ca.name)}
                leaf="crl"
                pathLabel={`pki ca ${ca.name} crl`}
                placeholder="MIIC... (PEM, single line)"
              />
            </div>
          </div>
        ))}
        {!isLoading && cas.length === 0 && <p className="text-xs text-slate-500">No CAs configured yet.</p>}
      </div>
    </div>
  )
}
