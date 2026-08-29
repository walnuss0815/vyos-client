import { useState } from 'react'
import {
  blankDHFormValues,
  blankKeyPairFormValues,
  deleteDHOp,
  deleteKeyPairOp,
  dhFormToOps,
  keyPairFormToOps,
  type PKIDHFormValues,
  type PKIKeyPairFormValues,
} from '../../lib/pkiKeyMaterialForm'
import type { PKIDHParams, PKIKeyPair } from '../../lib/pkiTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

const textareaClass =
  'w-full rounded border border-surface-border bg-surface-800 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-accent-500'

/** Generic key-pairs (referenced by WireGuard and other interfaces)
 * and Diffie-Hellman parameters - both simple standalone key-material
 * storage, so they share one page/section. */
export default function KeyMaterialSection({
  keyPairs,
  dhParams,
  isLoading,
}: {
  keyPairs: PKIKeyPair[]
  dhParams: PKIDHParams[]
  isLoading: boolean
}) {
  return (
    <div className="space-y-6">
      <KeyPairsSubsection keyPairs={keyPairs} isLoading={isLoading} />
      <DHSubsection dhParams={dhParams} isLoading={isLoading} />
    </div>
  )
}

function KeyPairsSubsection({ keyPairs, isLoading }: { keyPairs: PKIKeyPair[]; isLoading: boolean }) {
  const [showCreate, setShowCreate] = useState(false)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(name: string) {
    const op = deleteKeyPairOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-1 text-sm font-medium uppercase tracking-wide text-slate-500">
          Key pairs ({keyPairs.length})
          <InfoTooltip text="Generic public/private key material, referenced by name from WireGuard and other interfaces that need a key-pair - not tied to X.509 certificates." />
        </h2>
        <button onClick={() => setShowCreate((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showCreate ? 'Cancel' : '+ New key-pair'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-3">
          <KeyPairForm existingNames={keyPairs.map((k) => k.name)} onDone={() => setShowCreate(false)} />
        </div>
      )}

      <div className="space-y-2">
        {keyPairs.map((kp) => (
          <div
            key={kp.name}
            className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-900 px-3 py-2"
          >
            <div>
              <span className="font-mono text-sm text-white">{kp.name}</span>
              <p className="text-xs text-slate-400">
                {kp.hasPublicKey ? 'public key set' : 'no public key'} ·{' '}
                {kp.hasPrivateKey ? 'private key set' : 'no private key'}
              </p>
            </div>
            <button onClick={() => queueDelete(kp.name)} className="text-xs text-slate-500 hover:text-danger-500">
              Delete
            </button>
          </div>
        ))}
        {!isLoading && keyPairs.length === 0 && (
          <p className="text-xs text-slate-500">No key-pairs configured yet.</p>
        )}
      </div>
    </div>
  )
}

function KeyPairForm({ existingNames, onDone }: { existingNames: string[]; onDone: () => void }) {
  const [name, setName] = useState('')
  const [values, setValues] = useState<PKIKeyPairFormValues>(blankKeyPairFormValues())
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const taken = existingNames.includes(trimmedName)
  const valid = trimmedName !== '' && !taken

  function update<K extends keyof PKIKeyPairFormValues>(key: K, value: PKIKeyPairFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!valid) return
    const ops = keyPairFormToOps(trimmedName, undefined, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <label className={labelClass}>
        Name *
        <input
          {...noExtensionInputProps}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        {taken && <span className="text-danger-500">This key-pair already exists.</span>}
      </label>
      <label className={`${labelClass} mt-3`}>
        Public key (PEM, single line)
        <textarea
          value={values.publicKey}
          onChange={(e) => update('publicKey', e.target.value)}
          rows={2}
          className={textareaClass}
        />
      </label>
      <label className={`${labelClass} mt-3`}>
        Private key (PEM, single line)
        <textarea
          value={values.privateKey}
          onChange={(e) => update('privateKey', e.target.value)}
          rows={2}
          className={textareaClass}
        />
      </label>
      <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={values.passwordProtected}
          onChange={(e) => update('passwordProtected', e.target.checked)}
          className="accent-accent-500"
        />
        Private key is password-protected
      </label>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
          Queue key-pair creation
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}

function DHSubsection({ dhParams, isLoading }: { dhParams: PKIDHParams[]; isLoading: boolean }) {
  const [showCreate, setShowCreate] = useState(false)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(name: string) {
    const op = deleteDHOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-1 text-sm font-medium uppercase tracking-wide text-slate-500">
          Diffie-Hellman parameters ({dhParams.length})
          <InfoTooltip text="A public numeric group some services (e.g. OpenVPN) use to negotiate a shared secret over an untrusted connection - not a secret itself, just referenced by name." />
        </h2>
        <button onClick={() => setShowCreate((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showCreate ? 'Cancel' : '+ New DH params'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-3">
          <DHForm existingNames={dhParams.map((d) => d.name)} onDone={() => setShowCreate(false)} />
        </div>
      )}

      <div className="space-y-2">
        {dhParams.map((dh) => (
          <div
            key={dh.name}
            className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-900 px-3 py-2"
          >
            <span className="font-mono text-sm text-white">{dh.name}</span>
            <button onClick={() => queueDelete(dh.name)} className="text-xs text-slate-500 hover:text-danger-500">
              Delete
            </button>
          </div>
        ))}
        {!isLoading && dhParams.length === 0 && (
          <p className="text-xs text-slate-500">No DH parameters configured yet.</p>
        )}
      </div>
    </div>
  )
}

function DHForm({ existingNames, onDone }: { existingNames: string[]; onDone: () => void }) {
  const [name, setName] = useState('')
  const [values, setValues] = useState<PKIDHFormValues>(blankDHFormValues())
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const taken = existingNames.includes(trimmedName)
  const valid = trimmedName !== '' && !taken && values.parameters.trim() !== ''

  function submit() {
    if (!valid) return
    const ops = dhFormToOps(trimmedName, undefined, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <label className={labelClass}>
        Name *
        <input
          {...noExtensionInputProps}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        {taken && <span className="text-danger-500">This DH entry already exists.</span>}
      </label>
      <FieldLabel
        label="Parameters (PEM, single line) *"
        hint="The output of e.g. openssl dhparam - a public value, safe to generate ahead of time and reuse, not a secret to protect."
        className={`${labelClass} mt-3`}
      >
        <textarea
          value={values.parameters}
          onChange={(e) => setValues({ parameters: e.target.value })}
          rows={2}
          className={textareaClass}
        />
      </FieldLabel>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
          Queue DH creation
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}
