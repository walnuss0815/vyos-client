import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  blankContainerFormValues,
  containerFormToOps,
  containerToFormValues,
  type ContainerFormValues,
} from '../../lib/containerForm'
import { imageIsPulled } from '../../lib/containerImageMatch'
import {
  CONTAINER_CAPABILITIES,
  CONTAINER_LOG_DRIVERS,
  CONTAINER_RESTART_POLICIES,
  type ContainerNetwork,
} from '../../lib/containerTypes'
import type { ContainerDefinition } from '../../lib/containerTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import type { ConfigOp } from '../../lib/vyosApi'
import { pullContainerImage } from '../../lib/vyosApi'
import { useContainerImages } from '../../hooks/useContainerImages'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'
import ContainerCreateNestedSections from './ContainerCreateNestedSections'

interface ContainerFormProps {
  /** undefined = creating a new container. */
  container?: ContainerDefinition
  existingNames: string[]
  /** Only used in create mode, for the Network attachments draft
   * section's "attach to an existing network" dropdown - see
   * ContainerCreateNestedSections.tsx. */
  networks: ContainerNetwork[]
  onDone: () => void
}

export default function ContainerForm({ container, existingNames, networks, onDone }: ContainerFormProps) {
  const [name, setName] = useState(container?.name ?? '')
  const [values, setValues] = useState<ContainerFormValues>(
    container ? containerToFormValues(container) : blankContainerFormValues(),
  )
  // Everything queued via the nested-sections draft below (volumes,
  // devices, ports, network attachments, tmpfs, health check, DNS
  // servers, environment, labels, sysctl) - see
  // ContainerCreateNestedSections.tsx. Only ever populated in create
  // mode; stays empty (and unused) when editing an existing container,
  // which still uses ContainerNestedSections.tsx (queuing immediately)
  // exactly as before.
  const [nestedOps, setNestedOps] = useState<ConfigOp[]>([])
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = container === undefined
  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof ContainerFormValues>(key: K, value: ContainerFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function toggleCapability(cap: string) {
    setValues((v) => ({
      ...v,
      capabilities: v.capabilities.includes(cap)
        ? v.capabilities.filter((c) => c !== cap)
        : [...v.capabilities, cap],
    }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = containerFormToOps(trimmedName, container, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    // Queued in the SAME batch as the container's own creation ops
    // above, so a single "Queue container creation" click is enough
    // to define the whole container, nested resources included - see
    // ContainerCreateNestedSections.tsx's own doc comment for why
    // these can't be queued any earlier than this.
    for (const op of nestedOps) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">
        {isCreate ? 'New container' : `Edit container ${container.name}`}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Name *
          <input
            {...noExtensionInputProps}
            autoFocus
            disabled={!isCreate}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
          />
          {nameTaken && <span className="text-danger-500">This container already exists.</span>}
        </label>
        <label className={labelClass}>
          Image
          <input
            {...noExtensionInputProps}
            value={values.image}
            onChange={(e) => update('image', e.target.value)}
            placeholder="nginx:latest"
            className={inputClass}
          />
          <ImagePullPrompt imageRef={values.image} />
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
          Host name
          <input
            {...noExtensionInputProps}
            value={values.hostName}
            onChange={(e) => update('hostName', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Entrypoint (overrides image default)
          <input
            {...noExtensionInputProps}
            value={values.entrypoint}
            onChange={(e) => update('entrypoint', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Command (overrides image default)
          <input
            {...noExtensionInputProps}
            value={values.command}
            onChange={(e) => update('command', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Arguments
          <input
            {...noExtensionInputProps}
            value={values.arguments}
            onChange={(e) => update('arguments', e.target.value)}
            className={inputClass}
          />
        </label>
        <FieldLabel
          label="Restart policy"
          hint="no never restarts automatically; on-failure only restarts if the container exits with an error; always restarts unconditionally, even after a clean exit; unless-stopped is like always but doesn't restart after an explicit manual stop."
        >
          <select value={values.restart} onChange={(e) => update('restart', e.target.value)} className={inputClass}>
            <option value="">Default (on-failure)</option>
            {CONTAINER_RESTART_POLICIES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel
          label="Log driver"
          hint="journald sends output to the router's own systemd journal (viewable like any other system log); other drivers write plain files or discard output entirely."
        >
          <select
            value={values.logDriver}
            onChange={(e) => update('logDriver', e.target.value)}
            className={inputClass}
          >
            <option value="">Default (journald)</option>
            {CONTAINER_LOG_DRIVERS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </FieldLabel>
        <label className={labelClass}>
          CPU quota (cores, 0 = unlimited)
          <input
            {...noExtensionInputProps}
            value={values.cpuQuota}
            onChange={(e) => update('cpuQuota', e.target.value)}
            placeholder="0"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Memory (MB, 0 = unlimited)
          <input
            {...noExtensionInputProps}
            value={values.memory}
            onChange={(e) => update('memory', e.target.value)}
            placeholder="512"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Shared memory (MB, 0 = unlimited)
          <input
            {...noExtensionInputProps}
            value={values.sharedMemory}
            onChange={(e) => update('sharedMemory', e.target.value)}
            placeholder="64"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          UID
          <input
            {...noExtensionInputProps}
            value={values.uid}
            onChange={(e) => update('uid', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          GID
          <input
            {...noExtensionInputProps}
            value={values.gid}
            onChange={(e) => update('gid', e.target.value)}
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
          Disable this container
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.allowHostPid}
            onChange={(e) => update('allowHostPid', e.target.checked)}
            className="accent-accent-500"
          />
          Share host process namespace
          <InfoTooltip text="Lets the container see and signal processes running on the router itself, instead of only its own isolated process tree - a meaningful reduction in container isolation." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.allowHostNetworks}
            onChange={(e) => update('allowHostNetworks', e.target.checked)}
            className="accent-accent-500"
          />
          Share host networking
          <InfoTooltip text="The container uses the router's own network stack directly instead of an isolated one - no port mappings needed, but also no network isolation from the router." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.privileged}
            onChange={(e) => update('privileged', e.target.checked)}
            className="accent-accent-500"
          />
          Privileged (grant root capabilities)
        </label>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs text-slate-500">Linux capabilities</p>
        <div className="flex flex-wrap gap-3">
          {CONTAINER_CAPABILITIES.map((cap) => (
            <label key={cap} className="flex items-center gap-1.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={values.capabilities.includes(cap)}
                onChange={() => toggleCapability(cap)}
                className="accent-accent-500"
              />
              <span className="font-mono">{cap}</span>
            </label>
          ))}
        </div>
      </div>

      {isCreate && (
        // Deliberately always mounted once in create mode (not
        // conditional on trimmedName !== '') so clearing/retyping the
        // name mid-way through doesn't unmount this and discard
        // whatever's already been drafted below - see
        // ContainerCreateNestedSections.tsx's own doc comment. The
        // path labels shown just look slightly odd (an empty name
        // segment) until a name is typed, which is a fair trade for
        // never losing already-entered nested-resource drafts.
        <ContainerCreateNestedSections containerName={trimmedName} networks={networks} onOpsChange={setNestedOps} />
      )}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue container creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}

/** Cross-references the typed image reference against the router's
 * already-pulled images (`useContainerImages`) and, if it isn't found,
 * shows a "Pull now" prompt - per an explicit product decision, this
 * never pulls automatically; it only surfaces the option, since a
 * pull can legitimately take several minutes (mirrors ImagesPage
 * .tsx's own pull flow) and shouldn't start without a deliberate
 * click. Pulling here is the same immediate, non-staged op-mode
 * action ImagesPage.tsx uses - not part of this form's own
 * pending-changes submit, and not blocked by (or blocking) it either;
 * a container can be queued for creation before its image is pulled,
 * same as today, this just makes the gap visible instead of silent. */
function ImagePullPrompt({ imageRef }: { imageRef: string }) {
  const imagesQuery = useContainerImages()
  const queryClient = useQueryClient()
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = imageRef.trim()
  if (trimmed === '' || imagesQuery.isLoading || imagesQuery.isError) return null
  if (imageIsPulled(trimmed, imagesQuery.data ?? [])) return null

  async function handlePull() {
    setPulling(true)
    setError(null)
    try {
      await pullContainerImage(trimmed)
      void queryClient.invalidateQueries({ queryKey: ['container-images'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pull image.')
    } finally {
      setPulling(false)
    }
  }

  return (
    <span className="mt-1 flex flex-wrap items-center gap-2 text-amber-500">
      <span>Not pulled onto this router yet.</span>
      <button
        type="button"
        onClick={() => void handlePull()}
        disabled={pulling}
        className="text-accent-500 underline hover:text-accent-400 disabled:opacity-50"
      >
        {pulling ? 'Pulling… (can take minutes)' : 'Pull now'}
      </button>
      {error && <span className="text-danger-500">{error}</span>}
    </span>
  )
}
