import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useContainerConfig } from '../hooks/useContainerConfig'
import { useLogs } from '../hooks/useLogs'
import { downloadTextFile, exportTimestamp } from '../lib/downloadFile'
import { buttonClass, inputClass } from '../lib/formStyles'
import { LOG_FACILITIES, LOG_PRIORITIES } from '../lib/vyosApi'

/** The curated, fixed (non-parameterized) sources - see the backend's
 * `fixedLogSources` map (backend/internal/api/log_handlers.go), which
 * this mirrors one-for-one. 'facility'/'priority'/'container' are
 * handled separately below since each needs an additional value. */
const FIXED_SOURCES: { value: string; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'firewall', label: 'Firewall' },
  { value: 'ssh', label: 'SSH' },
  { value: 'https', label: 'HTTPS API' },
  { value: 'dhcp-server', label: 'DHCP server' },
  { value: 'vpn', label: 'VPN' },
  { value: 'frr', label: 'Routing (FRR)' },
]

const LINE_COUNT_OPTIONS = [100, 500, 1000, 2000] as const

/** How close to the bottom (in pixels) the log view has to already be
 * for new content to auto-scroll it further - lets a user scroll up
 * to read older lines during auto-poll without being yanked back down
 * on every new poll. */
const AUTO_SCROLL_THRESHOLD_PX = 48

export default function LogsPage() {
  const [source, setSource] = useState('system')
  const [facility, setFacility] = useState<string>(LOG_FACILITIES[0])
  const [priority, setPriority] = useState<string>(LOG_PRIORITIES[0])
  const [containerName, setContainerName] = useState<string | undefined>(undefined)
  const [lineCount, setLineCount] = useState(500)
  const [autoPoll, setAutoPoll] = useState(false)
  const [search, setSearch] = useState('')

  const { containers } = useContainerConfig()
  const effectiveContainerName = containerName ?? containers[0]?.name

  const isContainerSource = source === 'container'
  const hasNoContainers = isContainerSource && containers.length === 0

  const { lines, truncated, isLoading, isError, isFetching, refetch, clear } = useLogs({
    source,
    facility: source === 'facility' ? facility : undefined,
    priority: source === 'priority' ? priority : undefined,
    container: isContainerSource ? effectiveContainerName : undefined,
    lines: lineCount,
    autoPoll,
    enabled: !hasNoContainers,
  })

  const filteredLines = useMemo(() => {
    if (!search.trim()) return lines
    const needle = search.toLowerCase()
    return lines.filter((line) => line.toLowerCase().includes(needle))
  }, [lines, search])

  const setViewport = useAutoScrollToBottom(filteredLines.length)

  function handleDownload() {
    downloadTextFile(`log-${source}-${exportTimestamp()}.txt`, lines.join('\n'))
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="mb-1 text-lg font-semibold text-white">Logs</h1>
        <p className="text-sm text-slate-400">
          A bounded snapshot of one of this router's logs. VyOS has no incremental log-fetch
          mode, so auto-poll re-fetches the same window on a timer and appends only the lines
          that are genuinely new since the last poll.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-surface-border bg-surface-900 p-4">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Source
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className={inputClass}
          >
            {FIXED_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
            <option value="facility">By facility…</option>
            <option value="priority">By priority…</option>
            <option value="container">Container…</option>
          </select>
        </label>

        {source === 'facility' && (
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Facility
            <select
              value={facility}
              onChange={(e) => setFacility(e.target.value)}
              className={inputClass}
            >
              {LOG_FACILITIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        )}

        {source === 'priority' && (
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Minimum priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={inputClass}
            >
              {LOG_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        )}

        {isContainerSource && !hasNoContainers && (
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Container
            <select
              value={effectiveContainerName ?? ''}
              onChange={(e) => setContainerName(e.target.value)}
              className={inputClass}
            >
              {containers.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Lines
          <select
            value={lineCount}
            onChange={(e) => setLineCount(Number(e.target.value))}
            className={inputClass}
          >
            {LINE_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter shown lines"
            className={inputClass}
          />
        </label>

        <button onClick={() => refetch()} disabled={isFetching} className={`bg-accent-600 ${buttonClass}`}>
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>

        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={autoPoll}
            onChange={(e) => setAutoPoll(e.target.checked)}
            className="accent-accent-500"
          />
          Auto-poll (5s)
        </label>

        <button onClick={clear} className="text-xs text-slate-400 hover:text-slate-200">
          Clear
        </button>

        <button
          onClick={handleDownload}
          disabled={lines.length === 0}
          className="text-xs text-accent-500 hover:text-accent-400 disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:text-slate-600"
        >
          Download
        </button>
      </div>

      {hasNoContainers && (
        <p className="text-sm text-slate-400">No containers are configured yet.</p>
      )}
      {!hasNoContainers && isError && (
        <p className="mb-2 text-sm text-danger-500">Failed to load this log.</p>
      )}
      {!hasNoContainers && isLoading && <p className="text-sm text-slate-400">Loading…</p>}

      {!hasNoContainers && !isLoading && (
        <>
          {truncated && (
            <p className="mb-2 text-xs text-slate-500">
              Showing the last {lineCount} lines - older entries were cut off.
            </p>
          )}
          <pre
            ref={setViewport}
            className="h-[28rem] overflow-auto rounded-xl border border-surface-border bg-surface-950 p-4 font-mono text-xs text-slate-300"
          >
            {filteredLines.length > 0 ? filteredLines.join('\n') : 'No log lines to show.'}
          </pre>
        </>
      )}
    </div>
  )
}

/** Keeps the log viewport pinned to the bottom as new lines arrive
 * (via auto-poll), unless the user has scrolled up to read older
 * content - in which case new lines simply accumulate without
 * yanking their scroll position.
 *
 * Tracked via a live scroll-event listener rather than measuring
 * scroll position inside the same effect that reacts to new content:
 * by the time an effect runs, the DOM has already been updated with
 * the new lines, so scrollHeight would already reflect the *new*
 * content - too late to tell whether the user was at the bottom
 * *before* it arrived. A running "was the user at the bottom as of
 * their last scroll" flag, updated independently of content changes,
 * avoids that ordering problem (and self-corrects after this hook's
 * own programmatic scroll, since that itself fires a 'scroll' event).
 *
 * Returns a callback ref for the caller to attach to the `<pre>`,
 * rather than taking a `useRef` object as a parameter: the viewport
 * element is conditionally rendered (absent while loading/erroring),
 * so a plain `useRef`'s identity never changes across that
 * mount/unmount - an effect depending on the ref object itself (as
 * this used to) only ever runs once, while `ref.current` is still
 * null, and the scroll listener below then never attaches for the
 * lifetime of the page. The actual element is still held in a
 * `useRef` (mutating it directly, e.g. to set scrollTop, is exactly
 * what refs are for) - a separate `mountTick` counter, bumped by the
 * callback ref on every attach/detach, is what the effects below
 * depend on instead, so they re-run precisely when the element
 * mounts or unmounts without React ever re-rendering over a
 * DOM-holding piece of state.
 */
function useAutoScrollToBottom(contentLength: number) {
  const elementRef = useRef<HTMLPreElement | null>(null)
  const wasAtBottomRef = useRef(true)
  const [mountTick, setMountTick] = useState(0)

  const setViewport = useCallback((node: HTMLPreElement | null) => {
    elementRef.current = node
    setMountTick((n) => n + 1)
  }, [])

  useEffect(() => {
    const el = elementRef.current
    if (!el) return
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      wasAtBottomRef.current = distanceFromBottom < AUTO_SCROLL_THRESHOLD_PX
    }
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [mountTick])

  useEffect(() => {
    const el = elementRef.current
    if (!el || !wasAtBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [contentLength, mountTick])

  return setViewport
}
