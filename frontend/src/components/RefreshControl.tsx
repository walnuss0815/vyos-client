import {
  REFRESH_INTERVAL_OPTIONS,
  type RefreshIntervalSeconds,
  useRefreshSettingsStore,
} from '../store/refreshSettings'

/** Toggle + interval picker for live operational data (Dashboard,
 * Interfaces, Routes pages). One shared, persisted preference - see
 * store/refreshSettings.ts - rather than a separate control per page,
 * since there's no reason a user would want different refresh
 * behavior for interfaces vs. routes. */
export default function RefreshControl() {
  const enabled = useRefreshSettingsStore((s) => s.enabled)
  const intervalSeconds = useRefreshSettingsStore((s) => s.intervalSeconds)
  const setEnabled = useRefreshSettingsStore((s) => s.setEnabled)
  const setIntervalSeconds = useRefreshSettingsStore((s) => s.setIntervalSeconds)

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-accent-500"
        />
        Auto-refresh
      </label>
      {enabled && (
        <select
          aria-label="Auto-refresh interval"
          value={intervalSeconds}
          onChange={(e) => setIntervalSeconds(Number(e.target.value) as RefreshIntervalSeconds)}
          className="rounded border border-surface-border bg-surface-800 px-1.5 py-0.5 text-xs text-white outline-none focus:border-accent-500"
        >
          {REFRESH_INTERVAL_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}s
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
