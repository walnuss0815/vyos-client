import { useState } from 'react'
import {
  blankHealthCheckFormValues,
  healthCheckFormToOps,
  healthCheckToFormValues,
  type HealthCheckFormValues,
} from '../../lib/containerNestedForm'
import type { ContainerHealthCheck } from '../../lib/containerTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** ContainerNestedSections.tsx's "Health check" section, extracted
 * into its own file for size (see that file's own doc comment for why
 * it's split this way). Also reused by ContainerCreateNestedSections
 * .tsx in draft mode (via onSave) - see this component's own prop doc
 * comments.
 *
 * Unlike the other five sections, health check is a single object
 * (one per container, not a tagNode-keyed list), so there's no
 * separate add/remove - just one "Save health check" action. */
export default function ContainerHealthCheckSection({
  containerName,
  healthCheck,
  onSave,
}: {
  containerName: string
  healthCheck: ContainerHealthCheck
  /** Overrides what "Save health check" does, in place of the default
   * "immediately queue the real set/delete ops" - see ChipList.tsx's
   * onAdd doc comment for the general rationale. Receives the full
   * form values; `healthCheck` must then be whatever local state
   * onSave writes to (as a ContainerHealthCheck, not raw form
   * values). */
  onSave?: (values: HealthCheckFormValues) => void
}) {
  const [values, setValues] = useState(() => healthCheckToFormValues(healthCheck))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankHealthCheckFormValues>>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    if (onSave) {
      onSave(values)
      return
    }
    const ops = healthCheckFormToOps(containerName, healthCheck, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <input
        {...noExtensionInputProps}
        value={values.command}
        onChange={(e) => update('command', e.target.value)}
        placeholder="command"
        className={`col-span-2 ${inputClass}`}
      />
      <input
        {...noExtensionInputProps}
        value={values.interval}
        onChange={(e) => update('interval', e.target.value)}
        placeholder="interval (s, or disable)"
        className={inputClass}
      />
      <input
        {...noExtensionInputProps}
        value={values.timeout}
        onChange={(e) => update('timeout', e.target.value)}
        placeholder="timeout (s)"
        className={inputClass}
      />
      <input
        {...noExtensionInputProps}
        value={values.retry}
        onChange={(e) => update('retry', e.target.value)}
        placeholder="retries"
        className={inputClass}
      />
      <button onClick={save} className={`col-span-3 bg-accent-600 ${buttonClass}`}>
        Save health check
      </button>
    </div>
  )
}
