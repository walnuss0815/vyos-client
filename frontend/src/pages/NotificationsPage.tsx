import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNotifications } from '../hooks/useNotifications'
import { buttonClass } from '../lib/formStyles'
import type { Notification } from '../lib/vyosApi'
import { deleteNotification, markAllNotificationsRead, markNotificationRead } from '../lib/vyosApi'

const SEVERITY_STYLES: Record<Notification['severity'], string> = {
  info: 'text-accent-500',
  warning: 'text-warning-500',
  error: 'text-danger-500',
}

/**
 * The in-app notification feed - see backend/internal/notifications'
 * own doc comment for what these are (something this app itself
 * noticed, e.g. a background container-image-update check finding
 * one - not VyOS state, so this is deliberately a top-level page, not
 * folded into an existing config area).
 *
 * Follows ImagesPage.tsx's action pattern (direct API calls + a local
 * `refresh()` invalidating the shared query, rather than
 * useMutation - see that file's own comment for why this codebase
 * doesn't use TanStack Query's mutation hooks) rather than
 * introducing a new one just for this page.
 */
export default function NotificationsPage() {
  const query = useNotifications()
  const queryClient = useQueryClient()

  const [busyID, setBusyID] = useState<string | null>(null)
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  async function handleMarkRead(id: string) {
    setBusyID(id)
    setError(null)
    try {
      await markNotificationRead(id)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notification.')
    } finally {
      setBusyID(null)
    }
  }

  async function handleDismiss(id: string) {
    setBusyID(id)
    setError(null)
    try {
      await deleteNotification(id)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss notification.')
    } finally {
      setBusyID(null)
    }
  }

  async function handleMarkAllRead() {
    setMarkingAllRead(true)
    setError(null)
    try {
      await markAllNotificationsRead()
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notifications.')
    } finally {
      setMarkingAllRead(false)
    }
  }

  const notifications = query.data ?? []
  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-lg font-semibold text-white">Notifications</h1>
          <p className="text-sm text-slate-400">
            Things this app itself noticed and wants to tell you about - not VyOS configuration
            state.
          </p>
        </div>
        <button
          onClick={() => void handleMarkAllRead()}
          disabled={markingAllRead || unreadCount === 0}
          className={`shrink-0 bg-surface-800 ${buttonClass}`}
        >
          {markingAllRead ? 'Marking…' : 'Mark all read'}
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-danger-500">{error}</p>}

      {query.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {query.isError && <p className="text-sm text-danger-500">Failed to load notifications.</p>}
      {query.data && notifications.length === 0 && (
        <p className="text-sm text-slate-500">No notifications yet.</p>
      )}

      {notifications.length > 0 && (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`rounded-xl border p-3 ${
                n.read ? 'border-surface-border bg-surface-900' : 'border-accent-500/40 bg-surface-900'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-white">
                    <span className={SEVERITY_STYLES[n.severity]}>●</span>
                    {n.title}
                    {!n.read && (
                      <span className="rounded-full bg-accent-600/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-500">
                        New
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{n.message}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {n.category} · {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!n.read && (
                    <button
                      onClick={() => void handleMarkRead(n.id)}
                      disabled={busyID === n.id}
                      className="text-xs text-accent-500 hover:text-accent-400 disabled:opacity-50"
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    onClick={() => void handleDismiss(n.id)}
                    disabled={busyID === n.id}
                    className="text-xs text-slate-500 hover:text-danger-500 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
