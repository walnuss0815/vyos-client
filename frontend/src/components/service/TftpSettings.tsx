import { useState } from 'react'
import {
  addTFTPListenAddressOps,
  blankTFTPServerFormValues,
  disableTFTPServerOp,
  enableTFTPServerOp,
  removeTFTPListenAddressOp,
  tftpConfigToFormValues,
  tftpServerFormToOps,
} from '../../lib/serviceTftpForm'
import type { TFTPServerConfig } from '../../lib/serviceTftpTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function TftpSettings({ config }: { config: TFTPServerConfig }) {
  const add = usePendingChangesStore((s) => s.add)

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">The TFTP server is not configured.</p>
        <button
          onClick={() => {
            const op = enableTFTPServerOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable TFTP server
        </button>
      </div>
    )
  }

  return <TftpSettingsForm config={config} />
}

function TftpSettingsForm({ config }: { config: TFTPServerConfig }) {
  const [values, setValues] = useState(() => tftpConfigToFormValues(config))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankTFTPServerFormValues>>(
    key: K,
    value: ReturnType<typeof blankTFTPServerFormValues>[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = tftpServerFormToOps(config, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  function queueDisable() {
    const op = disableTFTPServerOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Directory" hint="The root directory on the router that files are served from - client requests for a file are resolved relative to this path.">
            <input {...noExtensionInputProps} value={values.directory} onChange={(e) => update('directory', e.target.value)} placeholder="/srv/tftp" className={inputClass} />
          </FieldLabel>
          <FieldLabel label="Port" hint="TFTP is an unauthenticated UDP protocol, so this only needs changing if the standard TFTP port conflicts with something else on the router.">
            <input {...noExtensionInputProps} value={values.port} onChange={(e) => update('port', e.target.value)} placeholder="69" className={inputClass} />
          </FieldLabel>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.allowUpload} onChange={(e) => update('allowUpload', e.target.checked)} className="accent-accent-500" />
          Allow uploads
          <InfoTooltip text="TFTP has no authentication, so enabling uploads lets any client on an allowed network write files into the directory above - keep this off unless you specifically need it (e.g. for network device config backups)." />
        </label>
        <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
          Save settings
        </button>
      </div>

      <ListenAddressesSection config={config} />

      <div>
        <button onClick={queueDisable} className="text-xs text-danger-500 hover:text-danger-400">
          Disable TFTP server entirely
        </button>
      </div>
    </div>
  )
}

function ListenAddressesSection({ config }: { config: TFTPServerConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [address, setAddress] = useState('')
  const [vrf, setVrf] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmed = address.trim()
  const taken = config.listenAddresses.some((l) => l.address === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addTFTPListenAddressOps(trimmed, vrf)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setAddress('')
    setVrf('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Listen addresses ({config.listenAddresses.length})
        </h2>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 flex items-center gap-2">
          <input {...noExtensionInputProps} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.0.2.1" className={inputClass} />
          <input {...noExtensionInputProps} value={vrf} onChange={(e) => setVrf(e.target.value)} placeholder="vrf (optional)" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          {taken && <p className="text-xs text-danger-500">Already configured.</p>}
        </div>
      )}
      <div className="space-y-1">
        {config.listenAddresses.map((la) => (
          <div key={la.address} className="flex items-center justify-between rounded border border-surface-border p-2">
            <span className="font-mono text-xs text-slate-300">
              {la.address}
              {la.vrf && <span className="text-slate-500"> vrf={la.vrf}</span>}
            </span>
            <button
              onClick={() => {
                const op = removeTFTPListenAddressOp(la.address)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
        ))}
        {config.listenAddresses.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      </div>
    </div>
  )
}
