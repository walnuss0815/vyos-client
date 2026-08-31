import { useState } from 'react'
import ChipList from '../ChipList'
import { deleteStaticHostMappingOp } from '../../lib/systemGeneralForm'
import { staticHostMappingPath } from '../../lib/systemParse'
import type { StaticHostMapping } from '../../lib/systemTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** VyOS's equivalent of static `/etc/hosts` entries - each host-name
 * maps to one or more addresses and, optionally, one or more aliases.
 * Mirrors StaticRouteCard.tsx's structure: a list of cards, each with
 * its own nested ChipLists for the multi-valued children. */
export default function StaticHostMappingList({ mappings }: { mappings: StaticHostMapping[] }) {
  const [showCreate, setShowCreate] = useState(false)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(hostName: string) {
    const op = deleteStaticHostMappingOp(hostName)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Static host mappings ({mappings.length})
        </h2>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New mapping'}
        </button>
      </div>

      {showCreate && (
        <CreateMappingForm
          existingHostNames={mappings.map((m) => m.hostName)}
          onDone={() => setShowCreate(false)}
        />
      )}

      <div className="space-y-2">
        {mappings.map((mapping) => (
          <div
            key={mapping.hostName}
            className="rounded-lg border border-surface-border bg-surface-800/50 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-sm text-white">{mapping.hostName}</span>
              <button
                onClick={() => queueDelete(mapping.hostName)}
                className="text-xs text-slate-500 hover:text-danger-500"
              >
                Delete
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-slate-500">Addresses</p>
                <ChipList
                  values={mapping.addresses}
                  basePath={staticHostMappingPath(mapping.hostName)}
                  leaf="inet"
                  pathLabel={`system static-host-mapping host-name ${mapping.hostName} inet`}
                  placeholder="10.0.0.5"
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-slate-500">Aliases</p>
                <ChipList
                  values={mapping.aliases}
                  basePath={staticHostMappingPath(mapping.hostName)}
                  leaf="alias"
                  pathLabel={`system static-host-mapping host-name ${mapping.hostName} alias`}
                  placeholder="nas"
                />
              </div>
            </div>
          </div>
        ))}
        {mappings.length === 0 && <p className="text-xs text-slate-500">No static mappings configured yet.</p>}
      </div>
    </div>
  )
}

function CreateMappingForm({
  existingHostNames,
  onDone,
}: {
  existingHostNames: string[]
  onDone: () => void
}) {
  const [hostName, setHostName] = useState('')
  // Draft addresses/aliases, buffered locally (via ChipList's onAdd/
  // onRemove overrides) rather than queued immediately, since this
  // host-name doesn't exist yet - see ChipList.tsx's own doc comment
  // on why ("could be orphaned if creation is abandoned"). Beyond the
  // first address, additional ones used to only be addable AFTER the
  // mapping already existed - the plain ChipLists rendered per
  // already-fetched mapping above only ever operate on a real one.
  const [addresses, setAddresses] = useState<string[]>([])
  const [aliases, setAliases] = useState<string[]>([])
  const add = usePendingChangesStore((s) => s.add)

  const trimmedHostName = hostName.trim()
  const taken = existingHostNames.includes(trimmedHostName)
  const valid = trimmedHostName !== '' && !taken && addresses.length > 0

  function submit() {
    if (!valid) return
    const base = staticHostMappingPath(trimmedHostName)
    const ops = [
      ...addresses.map((a) => ({ op: 'set' as const, path: [...base, 'inet'], value: a })),
      ...aliases.map((al) => ({ op: 'set' as const, path: [...base, 'alias'], value: al })),
    ]
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="mb-3 rounded-lg border border-surface-border p-3">
      <input
        {...noExtensionInputProps}
        autoFocus
        value={hostName}
        onChange={(e) => setHostName(e.target.value)}
        placeholder="fileserver"
        className={inputClass}
      />
      {taken && <p className="mt-1 text-xs text-danger-500">This host-name is already mapped.</p>}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-slate-500">Addresses *</p>
          <ChipList
            values={addresses}
            basePath={[]}
            leaf="inet"
            pathLabel={`system static-host-mapping host-name ${trimmedHostName || '<name>'} inet`}
            placeholder="10.0.0.5"
            onAdd={(value) => setAddresses((v) => [...v, value])}
            onRemove={(value) => setAddresses((v) => v.filter((a) => a !== value))}
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500">Aliases</p>
          <ChipList
            values={aliases}
            basePath={[]}
            leaf="alias"
            pathLabel={`system static-host-mapping host-name ${trimmedHostName || '<name>'} alias`}
            placeholder="nas (optional)"
            onAdd={(value) => setAliases((v) => [...v, value])}
            onRemove={(value) => setAliases((v) => v.filter((al) => al !== value))}
          />
        </div>
      </div>

      <button onClick={submit} disabled={!valid} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Queue mapping creation
      </button>
    </div>
  )
}
