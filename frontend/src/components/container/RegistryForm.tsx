import { useState } from 'react'
import {
  blankContainerRegistryFormValues,
  containerRegistryFormToOps,
  containerRegistryToFormValues,
  type ContainerRegistryFormValues,
} from '../../lib/containerRegistryForm'
import type { ContainerRegistry } from '../../lib/containerTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

interface RegistryFormProps {
  /** undefined = creating a new registry entry. */
  registry?: ContainerRegistry
  existingNames: string[]
  onDone: () => void
}

export default function RegistryForm({ registry, existingNames, onDone }: RegistryFormProps) {
  const [name, setName] = useState(registry?.name ?? '')
  const [values, setValues] = useState<ContainerRegistryFormValues>(
    registry ? containerRegistryToFormValues(registry) : blankContainerRegistryFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = registry === undefined
  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof ContainerRegistryFormValues>(
    key: K,
    value: ContainerRegistryFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = containerRegistryFormToOps(trimmedName, registry, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">
        {isCreate ? 'New registry' : `Edit registry ${registry.name}`}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Registry name *
          <input
            {...noExtensionInputProps}
            autoFocus
            disabled={!isCreate}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="docker.io"
            className={`${inputClass} disabled:opacity-60`}
          />
          {nameTaken && <span className="text-danger-500">This registry already exists.</span>}
        </label>
        <label className={labelClass}>
          Username
          <input
            {...noExtensionInputProps}
            value={values.username}
            onChange={(e) => update('username', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Password {!isCreate && registry.hasPassword ? '(configured - leave blank to keep)' : ''}
          <input
            {...noExtensionInputProps}
            type="password"
            value={values.password}
            onChange={(e) => update('password', e.target.value)}
            placeholder={!isCreate && registry.hasPassword ? '••••••••' : ''}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.disabled}
            onChange={(e) => update('disabled', e.target.checked)}
            className="accent-accent-500"
          />
          Disable this registry
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.insecure}
            onChange={(e) => update('insecure', e.target.checked)}
            className="accent-accent-500"
          />
          Allow unencrypted / untrusted TLS access
          <InfoTooltip text="Disables certificate verification and permits plaintext connections to this registry - only use for trusted internal/self-hosted registries, never for public ones." />
        </label>
      </div>

      <p className="mb-1 mt-3 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        Mirror (optional)
        <InfoTooltip text="Redirects pulls for this registry through a local pull-through cache instead of going straight to it - speeds up repeated pulls and reduces external bandwidth use." />
      </p>
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label="Address" hint="Where the mirror actually listens - the IP/hostname and port podman connects to.">
          <input
            {...noExtensionInputProps}
            value={values.mirrorAddress}
            onChange={(e) => update('mirrorAddress', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Host name" hint="The TLS certificate name to expect from the mirror, if it differs from the connection address above - leave blank unless the mirror's certificate doesn't match its address.">
          <input
            {...noExtensionInputProps}
            value={values.mirrorHostName}
            onChange={(e) => update('mirrorHostName', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Port" hint="TCP port the mirror is listening on, if not already included in the address above.">
          <input
            {...noExtensionInputProps}
            value={values.mirrorPort}
            onChange={(e) => update('mirrorPort', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Path" hint="URL path prefix the mirror expects requests under, if it doesn't serve the registry API from its root.">
          <input
            {...noExtensionInputProps}
            value={values.mirrorPath}
            onChange={(e) => update('mirrorPath', e.target.value)}
            placeholder="/v2"
            className={inputClass}
          />
        </FieldLabel>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue registry creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}
