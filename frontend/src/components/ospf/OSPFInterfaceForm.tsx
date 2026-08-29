import { useState } from 'react'
import {
  blankInterfaceFormValues,
  interfaceFormToOps,
  interfaceToFormValues,
  type OSPFInterfaceFormValues,
} from '../../lib/ospfInterfaceForm'
import { ospfInterfacePath } from '../../lib/ospfParse'
import { OSPF_NETWORK_TYPES_BY_PROTOCOL, type OSPFInterface, type OSPFProtocol } from '../../lib/ospfTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

interface OSPFInterfaceFormProps {
  protocol: OSPFProtocol
  /** undefined = creating a new interface entry. */
  iface?: OSPFInterface
  existingNames: string[]
  onDone: () => void
}

export default function OSPFInterfaceForm({ protocol, iface, existingNames, onDone }: OSPFInterfaceFormProps) {
  const [name, setName] = useState(iface?.name ?? '')
  const [values, setValues] = useState<OSPFInterfaceFormValues>(
    iface ? interfaceToFormValues(iface) : blankInterfaceFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = iface === undefined
  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof OSPFInterfaceFormValues>(key: K, value: OSPFInterfaceFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = interfaceFormToOps(protocol, trimmedName, iface, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  function queueClearAuthentication() {
    if (!iface) return
    const path = [...ospfInterfacePath(protocol, iface.name), 'authentication']
    add({ op: { op: 'delete', path }, label: `delete ${path.join(' ')}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">
        {isCreate ? 'New interface' : `Edit interface ${iface.name}`}
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Interface *
          <input
            {...noExtensionInputProps}
            autoFocus
            disabled={!isCreate}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="eth0"
            className={`${inputClass} disabled:opacity-60`}
          />
          {nameTaken && <span className="text-danger-500">This interface is already configured.</span>}
        </label>
        <label className={labelClass}>
          Area
          <input
            {...noExtensionInputProps}
            value={values.area}
            onChange={(e) => update('area', e.target.value)}
            placeholder="0 or 0.0.0.0"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Cost
          <input
            {...noExtensionInputProps}
            value={values.cost}
            onChange={(e) => update('cost', e.target.value.replace(/[^0-9]/g, ''))}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Priority
          <input
            {...noExtensionInputProps}
            value={values.priority}
            onChange={(e) => update('priority', e.target.value.replace(/[^0-9]/g, ''))}
            className={inputClass}
          />
        </label>
        <FieldLabel label="Dead interval (s)" hint="How long this router waits without hearing from a neighbor before declaring it down - must match neighbors' value or the adjacency won't form.">
          <input
            {...noExtensionInputProps}
            value={values.deadInterval}
            onChange={(e) => update('deadInterval', e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="40"
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Hello interval (s)" hint="How often this router sends its periodic Hello packet on this interface - like the field above, must match neighbors' value.">
          <input
            {...noExtensionInputProps}
            value={values.helloInterval}
            onChange={(e) => update('helloInterval', e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="10"
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel
          label="Network type"
          hint="How OSPF forms adjacencies on this link - broadcast elects a designated router automatically; point-to-point skips DR election entirely; nbma/point-to-multipoint are for non-broadcast media needing manually-configured neighbors."
        >
          <select
            value={values.networkType}
            onChange={(e) => update('networkType', e.target.value)}
            className={inputClass}
          >
            <option value="">(default)</option>
            {OSPF_NETWORK_TYPES_BY_PROTOCOL[protocol].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FieldLabel>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.passive}
            onChange={(e) => update('passive', e.target.checked)}
            className="accent-accent-500"
          />
          Passive
          <InfoTooltip text="This interface's network is still advertised into OSPF, but no Hello packets are sent on it and no adjacencies form here - useful for stub LANs with no other OSPF routers." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.mtuIgnore}
            onChange={(e) => update('mtuIgnore', e.target.checked)}
            className="accent-accent-500"
          />
          Ignore MTU mismatch
          <InfoTooltip text="OSPF normally refuses to form an adjacency if the two sides advertise different interface MTUs, as a sanity check - this skips that check." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.bfd}
            onChange={(e) => update('bfd', e.target.checked)}
            className="accent-accent-500"
          />
          Enable BFD
          <InfoTooltip text="Bidirectional Forwarding Detection - a lightweight, fast keepalive protocol that can detect a lost neighbor in milliseconds, well before OSPF's own timeout settings would notice." />
        </label>
      </div>

      {protocol === 'ospf' && (
        <div className="mt-3 border-t border-surface-border pt-3">
          <FieldLabel
            label="Authentication"
            hint="Overrides the area's own default setting for just this interface - 'Explicitly disabled' forces this one off even if the area otherwise requires it."
          >
            <select
              value={values.authMode}
              onChange={(e) => update('authMode', e.target.value as OSPFInterfaceFormValues['authMode'])}
              className={inputClass}
            >
              <option value="">None (inherit from area)</option>
              <option value="plaintext-password">Plaintext password</option>
              <option value="md5">MD5</option>
              <option value="null">Explicitly disabled (null)</option>
            </select>
          </FieldLabel>

          {values.authMode === 'plaintext-password' && (
            <label className={`${labelClass} mt-2`}>
              Password {!isCreate && iface.hasPlaintextPassword ? '(configured - leave blank to keep)' : ''}
              <input
                {...noExtensionInputProps}
                type="password"
                value={values.plaintextPassword}
                onChange={(e) => update('plaintextPassword', e.target.value)}
                placeholder={!isCreate && iface.hasPlaintextPassword ? '••••••••' : 'up to 8 characters'}
                className={inputClass}
              />
            </label>
          )}

          {values.authMode === 'md5' && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <FieldLabel label="Key ID" hint="Identifies which MD5 key slot this is - must match on both sides for a neighbor to verify packets signed with it.">
                <input
                  {...noExtensionInputProps}
                  value={values.md5KeyId}
                  onChange={(e) => update('md5KeyId', e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="1-255"
                  className={inputClass}
                />
              </FieldLabel>
              <label className={labelClass}>
                Key {!isCreate && iface.hasMd5Key ? '(configured - leave blank to keep)' : ''}
                <input
                  {...noExtensionInputProps}
                  type="password"
                  value={values.md5Key}
                  onChange={(e) => update('md5Key', e.target.value)}
                  placeholder={!isCreate && iface.hasMd5Key ? '••••••••' : 'up to 16 characters'}
                  className={inputClass}
                />
              </label>
            </div>
          )}

          {!isCreate && iface.authMode && (
            <button
              type="button"
              onClick={queueClearAuthentication}
              className="mt-2 text-xs text-danger-500 hover:text-danger-400"
            >
              Clear authentication
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue interface creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}
