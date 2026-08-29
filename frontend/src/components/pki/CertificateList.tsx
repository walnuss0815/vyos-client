import { useState } from 'react'
import CertificateForm from './CertificateForm'
import ExpiryBadge from './ExpiryBadge'
import ChipList from '../ChipList'
import { usePKIExpiry } from '../../hooks/usePKIExpiry'
import { deleteCertificateOp } from '../../lib/pkiCertificateForm'
import { pkiCertificatePath } from '../../lib/pkiParse'
import type { PKICertificate } from '../../lib/pkiTypes'
import { buttonClass } from '../../lib/formStyles'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

export default function CertificateList({
  certificates,
  isLoading,
}: {
  certificates: PKICertificate[]
  isLoading: boolean
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)
  const { certificates: expiry } = usePKIExpiry()

  function queueDelete(name: string) {
    const op = deleteCertificateOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? certificates.find((c) => c.name === editingName) : undefined

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Leaf certificates referenced by other config - e.g. this app's own{' '}
          <code>TLS_CERT_FILE</code>/<code>TLS_KEY_FILE</code>, or syslog's TLS-encrypted remote
          logging.
        </p>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingName(null)
          }}
          className={`shrink-0 bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New certificate'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-4">
          <CertificateForm
            existingNames={certificates.map((c) => c.name)}
            onDone={() => setShowCreate(false)}
          />
        </div>
      )}

      {editing && (
        <div className="mb-4">
          <CertificateForm
            certificate={editing}
            existingNames={certificates.map((c) => c.name)}
            onDone={() => setEditingName(null)}
          />
        </div>
      )}

      <div className="space-y-3">
        {certificates.map((cert) => (
          <div key={cert.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-white">{cert.name}</span>
                  {cert.revoked && (
                    <span className="rounded bg-danger-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-danger-500">
                      revoked
                    </span>
                  )}
                  {cert.hasPrivateKey && (
                    <span className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-400">
                      has private key
                    </span>
                  )}
                  <ExpiryBadge entry={expiry.get(cert.name)} />
                </div>
                {cert.description && <p className="text-xs text-slate-400">{cert.description}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button
                  onClick={() => {
                    setEditingName(cert.name)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button
                  onClick={() => queueDelete(cert.name)}
                  className="text-slate-500 hover:text-danger-500"
                >
                  Delete
                </button>
              </div>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs text-slate-500">
                ACME domain names
                <InfoTooltip text="The domain(s) this certificate should be valid for - ACME proves you control each one before issuing (or renewing) the certificate." />
              </p>
              <ChipList
                values={cert.acme.domainNames}
                basePath={pkiCertificatePath(cert.name, 'acme')}
                leaf="domain-name"
                pathLabel={`pki certificate ${cert.name} acme domain-name`}
                placeholder="example.com"
              />
            </div>
          </div>
        ))}
        {!isLoading && certificates.length === 0 && (
          <p className="text-xs text-slate-500">No certificates configured yet.</p>
        )}
      </div>
    </div>
  )
}
