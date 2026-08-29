import { useState } from 'react'
import { useInterfaceConfig } from '../../hooks/useInterfaceConfig'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { vrfPath } from '../../lib/interfaceParse'
import type { Vrf } from '../../lib/interfaceTypes'
import { isValidVyOSIdentifier } from '../../lib/vyosIdentifier'
import { usePendingChangesStore } from '../../store/pendingChanges'

export default function VrfPage() {
  const { vrfs, isLoading, isError } = useInterfaceConfig()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          A VRF is its own isolated routing table - assign an interface to one from the Ethernet/
          Bonding/Bridge tabs. VyOS requires a routing table ID when a VRF is created, and it can't
          be changed afterward - delete and re-create the VRF instead.
        </p>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className={`shrink-0 bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New VRF'}
        </button>
      </div>

      {showCreate && <CreateVrfForm onDone={() => setShowCreate(false)} />}

      {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {isError && <p className="text-sm text-danger-500">Failed to load VRF configuration.</p>}

      <div className="overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-900 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Routing table</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {vrfs.map((vrf) => (
              <VrfRow key={vrf.name} vrf={vrf} />
            ))}
            {!isLoading && vrfs.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-500">
                  No VRFs configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CreateVrfForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [table, setTable] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const tableValid = /^\d+$/.test(table.trim())
  const valid = isValidVyOSIdentifier(name.trim()) && tableValid

  function submit() {
    if (!valid) return
    const vrfName = name.trim()
    const tableId = table.trim()
    add({
      op: { op: 'set', path: vrfPath(vrfName, 'table'), value: tableId },
      label: `set vrf name ${vrfName} table '${tableId}'`,
    })
    onDone()
  }

  return (
    <div className="mb-4 rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Name
          <input
            {...noExtensionInputProps}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="red"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Routing table ID
          <input
            {...noExtensionInputProps}
            value={table}
            onChange={(e) => setTable(e.target.value)}
            placeholder="100"
            className={inputClass}
          />
          {table.trim() !== '' && !tableValid && (
            <span className="text-danger-500">Must be a whole number.</span>
          )}
        </label>
      </div>
      <button onClick={submit} disabled={!valid} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Queue VRF creation
      </button>
    </div>
  )
}

function VrfRow({ vrf }: { vrf: Vrf }) {
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete() {
    add({ op: { op: 'delete', path: vrfPath(vrf.name) }, label: `delete vrf name ${vrf.name}` })
  }

  return (
    <tr className="border-t border-surface-border bg-surface-900/50 hover:bg-surface-800">
      <td className="px-4 py-2 font-mono text-sm text-white">{vrf.name}</td>
      <td className="px-4 py-2 font-mono text-xs text-slate-400">{vrf.table}</td>
      <td className="px-4 py-2 text-right">
        <button onClick={queueDelete} className="text-xs text-slate-500 hover:text-danger-500">
          Delete VRF
        </button>
      </td>
    </tr>
  )
}
