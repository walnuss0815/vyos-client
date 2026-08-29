import { useState } from 'react'
import { useConfigWarnings } from '../hooks/useConfigWarnings'
import { useSystemInfo } from '../hooks/useSystemInfo'

/**
 * Persistent, global "possible security misconfiguration" banner -
 * see lib/configWarnings.ts for the individual checks and
 * hooks/useConfigWarnings.ts for how they're sourced. Rendered inline
 * at the top of Layout.tsx's <main>, above the page's own content, on
 * every authenticated page - not a dedicated audit page, and not
 * inline per-page warnings (both considered and explicitly not chosen
 * for this pass).
 *
 * Unlike PendingChangesBar, this has no dismiss/acknowledge action -
 * these are standing facts about the committed configuration, not a
 * one-time notification, so it stays visible for as long as the
 * underlying condition does. Collapsed to a single summary line by
 * default (same collapse/expand interaction PendingChangesBar uses),
 * expandable to see every individual warning's message.
 *
 * Disabled by default (CONFIG_WARNINGS_ENABLED, surfaced via
 * useSystemInfo()'s configWarningsEnabled field) - the checks
 * themselves are opinionated security-posture judgment calls, not
 * factual VyOS state, so this is opt-in rather than always-on. This
 * outer component only calls useSystemInfo() (already fetched/cached
 * everywhere in this app, so checking the flag here costs nothing
 * extra) and mounts ConfigWarningsBannerContent - where
 * useConfigWarnings() and its three underlying config-tree fetches
 * actually happen - only when the flag is on, so a disabled banner
 * has zero fetch overhead of its own, not just a hidden UI.
 */
export default function ConfigWarningsBanner() {
  const { data: systemInfo } = useSystemInfo()
  if (!systemInfo?.configWarningsEnabled) return null
  return <ConfigWarningsBannerContent />
}

function ConfigWarningsBannerContent() {
  const { warnings, isLoading } = useConfigWarnings()
  const [expanded, setExpanded] = useState(false)

  if (isLoading || warnings.length === 0) return null

  return (
    <div className="border-b border-warning-500/40 bg-warning-500/10">
      <div className="px-6 py-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-warning-500"
        >
          <span>
            {warnings.length} configuration warning{warnings.length === 1 ? '' : 's'}
          </span>
          <span className="text-xs text-warning-500/80">{expanded ? 'Hide' : 'Show'}</span>
        </button>
        {expanded && (
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            {warnings.map((w) => (
              <li key={w.id}>{w.message}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
