import { useState } from 'react'
import {
  areaFormToOps,
  areaToFormValues,
  blankAreaFormValues,
  type OSPFAreaFormValues,
} from '../../lib/ospfAreaForm'
import type { OSPFArea, OSPFProtocol } from '../../lib/ospfTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

interface OSPFAreaFormProps {
  protocol: OSPFProtocol
  /** undefined = creating a new area. */
  area?: OSPFArea
  existingIds: string[]
  onDone: () => void
}

/** Create/edit form for an OSPF(v3) area's metadata (id, area-type,
 * authentication). Networks and ranges are managed separately, per
 * already-created area - see OSPFAreaList.tsx - since (particularly
 * for OSPFv3, whose areas have no `network` statement at all) an area
 * can be perfectly valid with zero of either, unlike a static route's
 * mandatory first "via". */
export default function OSPFAreaForm({ protocol, area, existingIds, onDone }: OSPFAreaFormProps) {
  const [id, setId] = useState(area?.id ?? '')
  const [values, setValues] = useState<OSPFAreaFormValues>(
    area ? areaToFormValues(area) : blankAreaFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = area === undefined
  const trimmedId = id.trim()
  const idTaken = isCreate && existingIds.includes(trimmedId)
  const canSubmit = trimmedId !== '' && !idTaken

  function update<K extends keyof OSPFAreaFormValues>(key: K, value: OSPFAreaFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = areaFormToOps(protocol, trimmedId, area, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">{isCreate ? 'New area' : `Edit area ${area.id}`}</h3>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Area ID *
          <input
            {...noExtensionInputProps}
            autoFocus
            disabled={!isCreate}
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="0 or 0.0.0.0"
            className={`${inputClass} disabled:opacity-60`}
          />
          {idTaken && <span className="text-danger-500">This area already exists.</span>}
        </label>
        <FieldLabel
          label="Area type"
          hint="Normal areas carry full inter-area route detail. Stub areas block external (redistributed) routes from entering, replacing them with a default route. NSSA is a stub variant that still allows its own local external routes in, just not ones from other areas."
        >
          <select
            value={values.areaType}
            onChange={(e) => update('areaType', e.target.value as OSPFAreaFormValues['areaType'])}
            className={inputClass}
          >
            <option value="">Normal</option>
            <option value="stub">Stub</option>
            <option value="nssa">NSSA</option>
          </select>
        </FieldLabel>

        {(values.areaType === 'stub' || values.areaType === 'nssa') && (
          <>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={values.noSummary}
                onChange={(e) => update('noSummary', e.target.checked)}
                className="accent-accent-500"
              />
              No-summary (totally stubby)
              <InfoTooltip text="Also blocks inter-area summary routes, leaving only the default route in and nothing else - the strictest, smallest possible routing table for this area." />
            </label>
            <FieldLabel
              label="Default cost"
              hint="The cost advertised for the implicit default route this area's border router injects in place of the routes it's hiding."
            >
              <input
                {...noExtensionInputProps}
                value={values.defaultCost}
                onChange={(e) => update('defaultCost', e.target.value.replace(/[^0-9]/g, ''))}
                className={inputClass}
              />
            </FieldLabel>
          </>
        )}

        {values.areaType === 'nssa' && protocol === 'ospf' && (
          <FieldLabel
            label="NSSA translate role"
            hint="Controls which border router rewrites this area's own external routes into a form other areas can use - Always/Never force it on or off, Candidate lets OSPF elect one automatically."
          >
            <select
              value={values.nssaTranslate}
              onChange={(e) => update('nssaTranslate', e.target.value as OSPFAreaFormValues['nssaTranslate'])}
              className={inputClass}
            >
              <option value="">(default: candidate)</option>
              <option value="always">Always</option>
              <option value="candidate">Candidate</option>
              <option value="never">Never</option>
            </select>
          </FieldLabel>
        )}

        {values.areaType === 'nssa' && protocol === 'ospfv3' && (
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.nssaDefaultInformationOriginate}
              onChange={(e) => update('nssaDefaultInformationOriginate', e.target.checked)}
              className="accent-accent-500"
            />
            Originate Type-7 default into this NSSA
            <InfoTooltip text="Injects a default route into this area using the NSSA-specific LSA type, rather than relying on one arriving from elsewhere." />
          </label>
        )}

        {protocol === 'ospf' && (
          <FieldLabel
            label="Authentication"
            hint="The area-wide default for OSPF Hello/LSA exchanges - individual interfaces in this area can still override it with their own setting."
          >
            <select
              value={values.authentication}
              onChange={(e) =>
                update('authentication', e.target.value as OSPFAreaFormValues['authentication'])
              }
              className={inputClass}
            >
              <option value="">None</option>
              <option value="plaintext-password">Plaintext password</option>
              <option value="md5">MD5</option>
            </select>
          </FieldLabel>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue area creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}
