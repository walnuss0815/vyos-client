import { useState } from 'react'
import { blankHealthCheckFormValues, healthCheckFormToOps, healthCheckToFormValues } from '../../lib/containerNestedForm'
import type { ContainerDefinition } from '../../lib/containerTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** ContainerNestedSections.tsx's "Health check" section, extracted
 * into its own file for size (see that file's own doc comment for why
 * it's split this way). */
export default function ContainerHealthCheckSection({ container }: { container: ContainerDefinition }) {
  const [values, setValues] = useState(() => healthCheckToFormValues(container.healthCheck))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankHealthCheckFormValues>>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = healthCheckFormToOps(container.name, container.healthCheck, values)
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
