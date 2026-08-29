import { useState } from 'react'
import {
  blankContainerNetworkFormValues,
  containerNetworkFormToOps,
  containerNetworkToFormValues,
  type ContainerNetworkFormValues,
} from '../../lib/containerNetworkForm'
import { containerNetworkPath } from '../../lib/containerParse'
import { CONTAINER_MACVLAN_MODES, type ContainerNetwork } from '../../lib/containerTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

interface NetworkFormProps {
  /** undefined = creating a new network. */
  network?: ContainerNetwork
  existingNames: string[]
  onDone: () => void
}

export default function NetworkForm({ network, existingNames, onDone }: NetworkFormProps) {
  const [name, setName] = useState(network?.name ?? '')
  const [values, setValues] = useState<ContainerNetworkFormValues>(
    network ? containerNetworkToFormValues(network) : blankContainerNetworkFormValues(),
  )
  const [initialPrefix, setInitialPrefix] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = network === undefined
  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  // VyOS caps container network names at 11 characters.
  const tooLong = trimmedName.length > 11
  const canSubmit = trimmedName !== '' && !nameTaken && !tooLong

  function update<K extends keyof ContainerNetworkFormValues>(key: K, value: ContainerNetworkFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = containerNetworkFormToOps(trimmedName, network, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    // VyOS refuses to commit a container network with no prefix at
    // all - and NetworkList.tsx's ChipList (the normal way to add one)
    // only ever operates on an already-fetched, real network, so a
    // brand new one has no way to get a prefix before its own first
    // commit without this. Queuing it here, in the same commit as
    // creation, is what breaks that deadlock.
    if (isCreate && initialPrefix.trim()) {
      add({
        op: { op: 'set', path: [...containerNetworkPath(trimmedName), 'prefix'], value: initialPrefix.trim() },
        label: `set container network ${trimmedName} prefix '${initialPrefix.trim()}'`,
      })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">
        {isCreate ? 'New container network' : `Edit network ${network.name}`}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Name * (max 11 characters)
          <input
            {...noExtensionInputProps}
            autoFocus
            disabled={!isCreate}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
          />
          {nameTaken && <span className="text-danger-500">This network already exists.</span>}
          {tooLong && <span className="text-danger-500">Network name cannot be longer than 11 characters.</span>}
        </label>
        <label className={labelClass}>
          Description
          <input
            {...noExtensionInputProps}
            value={values.description}
            onChange={(e) => update('description', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          MTU
          <input
            {...noExtensionInputProps}
            value={values.mtu}
            onChange={(e) => update('mtu', e.target.value)}
            placeholder="1500"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          VRF
          <input
            {...noExtensionInputProps}
            value={values.vrf}
            onChange={(e) => update('vrf', e.target.value)}
            className={inputClass}
          />
        </label>
        {isCreate && (
          <FieldLabel
            label="Initial prefix"
            hint="VyOS requires a container network to have at least one prefix before it can be committed - add one now, or (if you're deliberately creating an otherwise-empty network to add a prefix to differently) know that the very first commit will fail without it."
          >
            <input
              {...noExtensionInputProps}
              value={initialPrefix}
              onChange={(e) => setInitialPrefix(e.target.value)}
              placeholder="172.20.0.0/24"
              className={inputClass}
            />
          </FieldLabel>
        )}
        <FieldLabel
          label="Type"
          hint="bridge creates a private virtual switch shared by containers on it; macvlan instead gives each container its own MAC address directly on a physical interface, appearing as a separate device on the LAN."
        >
          <select
            value={values.type}
            onChange={(e) => update('type', e.target.value as ContainerNetworkFormValues['type'])}
            className={inputClass}
          >
            <option value="">Default (bridge)</option>
            <option value="bridge">bridge</option>
            <option value="macvlan">macvlan</option>
          </select>
        </FieldLabel>
        {values.type === 'macvlan' && (
          <>
            <FieldLabel
              label="MACVLAN mode"
              hint="Controls visibility between containers on this parent interface and the host itself - modes differ in whether containers can talk to each other, to the router, or only out to the physical network."
            >
              <select
                value={values.macvlanMode}
                onChange={(e) => update('macvlanMode', e.target.value)}
                className={inputClass}
              >
                <option value="">Select a mode…</option>
                {CONTAINER_MACVLAN_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <label className={labelClass}>
              MACVLAN parent interface
              <input
                {...noExtensionInputProps}
                value={values.macvlanParent}
                onChange={(e) => update('macvlanParent', e.target.value)}
                placeholder="eth0"
                className={inputClass}
              />
            </label>
          </>
        )}
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={values.noNameServer}
          onChange={(e) => update('noNameServer', e.target.checked)}
          className="accent-accent-500"
        />
        Disable the DNS plugin for this network
        <InfoTooltip text="By default containers on this network can resolve each other by name automatically - disabling this turns that off, so containers would need to reach each other by IP address instead." />
      </label>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue network creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}
