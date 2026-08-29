import { useState } from 'react'
import KeyValuePairList from '../KeyValuePairList'
import { eventHandlerEnvironmentPath } from '../../lib/serviceEventHandlerParse'
import {
  blankEventHandlerEventFormValues,
  deleteEventHandlerEventOp,
  disableEventHandlerOp,
  enableEventHandlerOp,
  eventHandlerEventFormToOps,
  eventHandlerEventToFormValues,
} from '../../lib/serviceEventHandlerForm'
import type { EventHandlerConfig, EventHandlerEvent } from '../../lib/serviceEventHandlerTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function EventHandlerList({ config }: { config: EventHandlerConfig }) {
  const add = usePendingChangesStore((s) => s.add)

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">Event handler is not configured.</p>
        <button
          onClick={() => {
            const op = enableEventHandlerOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable event handler
        </button>
      </div>
    )
  }

  return <EventHandlerEnabled config={config} />
}

function EventHandlerEnabled({ config }: { config: EventHandlerConfig }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [expandedName, setExpandedName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(name: string) {
    const op = deleteEventHandlerEventOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  function queueDisable() {
    const op = disableEventHandlerOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? config.events.find((e) => e.name === editingName) : undefined

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500">
        The script path must already exist on the router - this app can reference an existing
        script, not create one.
      </p>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Events ({config.events.length})
        </h2>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingName(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New event'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-3">
          <EventForm existingNames={config.events.map((e) => e.name)} onDone={() => setShowCreate(false)} />
        </div>
      )}
      {editing && (
        <div className="mb-3">
          <EventForm
            event={editing}
            existingNames={config.events.map((e) => e.name)}
            onDone={() => setEditingName(null)}
          />
        </div>
      )}

      <div className="space-y-3">
        {config.events.map((event) => (
          <div key={event.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-sm font-medium text-white">{event.name}</span>
                <p className="text-xs text-slate-400">{event.scriptPath || 'no script path set'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button onClick={() => setExpandedName((n) => (n === event.name ? null : event.name))} className="text-accent-500 hover:text-accent-400">
                  {expandedName === event.name ? 'Hide env' : 'Environment'}
                </button>
                <button
                  onClick={() => {
                    setEditingName(event.name)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(event.name)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
            {expandedName === event.name && (
              <div className="mt-3 border-t border-surface-border pt-3">
                <p className="mb-1 flex items-center gap-1 text-xs text-slate-500">
                  Environment variables
                  <InfoTooltip text="Passed into the script's process environment when it runs - useful for exposing extra context (e.g. a severity level) without having to re-parse the log line inside the script." />
                </p>
                <KeyValuePairList
                  items={event.environment.map((e) => ({ id: e.name, value: e.value }))}
                  basePath={eventHandlerEnvironmentPath(event.name)}
                  pathLabel={`service event-handler event ${event.name} script environment`}
                  idPlaceholder="LEVEL"
                  valuePlaceholder="critical"
                />
              </div>
            )}
          </div>
        ))}
        {config.events.length === 0 && <p className="text-xs text-slate-500">No events configured yet.</p>}
      </div>

      <div>
        <button onClick={queueDisable} className="text-xs text-danger-500 hover:text-danger-400">
          Disable event handler entirely
        </button>
      </div>
    </div>
  )
}

function EventForm({
  event,
  existingNames,
  onDone,
}: {
  event?: EventHandlerEvent
  existingNames: string[]
  onDone: () => void
}) {
  const [name, setName] = useState(event?.name ?? '')
  const [values, setValues] = useState(
    event ? eventHandlerEventToFormValues(event) : blankEventHandlerEventFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = event === undefined
  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof ReturnType<typeof blankEventHandlerEventFormValues>>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = eventHandlerEventFormToOps(trimmedName, event, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">{isCreate ? 'New event' : `Edit ${event.name}`}</h3>
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
          {nameTaken && <span className="text-danger-500">This event already exists.</span>}
        </label>
        <FieldLabel label="Filter: syslog identifier" hint="Only matches log lines tagged with this process/program name (the SYSLOG_IDENTIFIER field) - leave blank to consider messages from any source.">
          <input {...noExtensionInputProps} value={values.filterSyslogIdentifier} onChange={(e) => update('filterSyslogIdentifier', e.target.value)} className={inputClass} />
        </FieldLabel>
        <FieldLabel label="Filter: pattern" hint="A regular expression the log message text must match for this event to fire - combined with the identifier above if both are set.">
          <input {...noExtensionInputProps} value={values.filterPattern} onChange={(e) => update('filterPattern', e.target.value)} className={inputClass} />
        </FieldLabel>
        <FieldLabel label="Script path" hint="Executed whenever a matching log message appears - must be an existing, executable file on the router; this app does not create or upload the script itself.">
          <input {...noExtensionInputProps} value={values.scriptPath} onChange={(e) => update('scriptPath', e.target.value)} placeholder="/config/scripts/notify.sh" className={inputClass} />
        </FieldLabel>
        <FieldLabel label="Script arguments" hint="Extra command-line arguments passed to the script on every run, in addition to the matched log line and any environment variables set below.">
          <input {...noExtensionInputProps} value={values.scriptArguments} onChange={(e) => update('scriptArguments', e.target.value)} className={inputClass} />
        </FieldLabel>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}
