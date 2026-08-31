import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useIngresses } from '../hooks/useIngresses'
import { useSystemInfo } from '../hooks/useSystemInfo'
import { DEFAULT_DOCUMENT_TITLE } from '../lib/constants'
import { useSessionStore } from '../store/session'
import ConfigWarningsBanner from './ConfigWarningsBanner'
import PendingChangesBar from './PendingChangesBar'
import ThemeToggle from './ThemeToggle'

// Grouped by theme rather than alphabetically/by-addition-order:
// overview -> core networking -> traffic control -> services ->
// resilience -> identity -> admin/tooling. Confirmed with the user
// directly (this ordering isn't derivable from VyOS's own structure,
// since VyOS's CLI tree is alphabetical) - see docs/roadmap.md.
const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/interfaces', label: 'Interfaces' },
  { to: '/routes', label: 'Routing' },
  { to: '/firewall', label: 'Firewall' },
  { to: '/nat', label: 'NAT' },
  { to: '/load-balancing', label: 'Load Balancing' },
  { to: '/qos', label: 'Traffic Policy / QoS' },
  { to: '/policy', label: 'Policy' },
  { to: '/dhcp', label: 'DHCP' },
  { to: '/vpn', label: 'VPN' },
  { to: '/service', label: 'Service' },
  { to: '/container', label: 'Container' },
  { to: '/high-availability', label: 'High Availability' },
  { to: '/pki', label: 'Public Key Infrastructure (PKI)' },
  { to: '/system', label: 'System' },
  { to: '/config-tree', label: 'Config Tree' },
  { to: '/logs', label: 'Logs' },
  { to: '/files', label: 'Files' },
]

export { DEFAULT_DOCUMENT_TITLE }

/**
 * Sidebar breakpoint: below `lg`, the sidebar is an off-canvas drawer
 * (fixed, translated fully off-screen, toggled by a hamburger button
 * in a mobile-only top bar) instead of always-visible; at `lg` and
 * above it's back to the original always-visible, non-collapsible
 * layout. This is the app's first layout-level responsive handling -
 * see docs/roadmap.md for the "usable on phones, not phone-optimized"
 * scope this was built to (dense per-page content like Firewall
 * rulesets/QoS policies isn't redesigned for narrow screens, only the
 * app shell itself).
 */
export default function Layout() {
  const user = useSessionStore((s) => s.user)
  const logout = useSessionStore((s) => s.logout)
  const systemInfoQuery = useSystemInfo()
  const ingressEnabled = systemInfoQuery.data?.ingressEnabled ?? false
  const ingressesQuery = useIngresses(ingressEnabled)
  const ingresses = ingressesQuery.data ?? []
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close the drawer automatically after navigating - without this,
  // picking a nav link on mobile would leave the drawer covering the
  // page it just navigated to. Deliberately not a useEffect: this is
  // React's own documented "adjust state when a prop/value changes"
  // pattern (comparing against a value from the previous render and
  // calling setState directly during render, not inside an effect) -
  // it avoids an extra render pass and oxlint's react(set-state-in-
  // effect) warning that a `useEffect([location.pathname])` version
  // of this would trigger.
  const [prevPathname, setPrevPathname] = useState(location.pathname)
  if (location.pathname !== prevPathname) {
    setPrevPathname(location.pathname)
    setSidebarOpen(false)
  }

  useEffect(() => {
    document.title = systemInfoQuery.data?.hostname ?? DEFAULT_DOCUMENT_TITLE
    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE
    }
  }, [systemInfoQuery.data])

  return (
    <div className="flex h-screen overflow-hidden bg-surface-950">
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-surface-border bg-surface-900 px-4 py-3 lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="text-slate-300 hover:text-white"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M3 5.75A.75.75 0 0 1 3.75 5h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 5.75Zm0 4.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10Zm.75 3.5a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H3.75Z"
            />
          </svg>
        </button>
        <span className="min-w-0 truncate font-semibold text-white">
          {systemInfoQuery.data?.hostname ?? DEFAULT_DOCUMENT_TITLE}
        </span>
        <div className="w-6" />
      </div>

      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-56 shrink-0 flex-col overflow-y-auto border-r border-surface-border bg-surface-900 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-surface-border px-4 py-4">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            VyOS Client
          </span>
          <span className="block min-w-0 truncate font-semibold text-white">
            {systemInfoQuery.data?.hostname ?? DEFAULT_DOCUMENT_TITLE}
          </span>
          <div className="mt-3">
            <ThemeToggle />
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-accent-600/15 text-accent-500'
                    : 'text-slate-400 hover:bg-surface-800 hover:text-slate-200'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}

          {/* A separate, dynamic group (per the feature's own
           * requirement) rather than folded into navItems above: its
           * contents depend on runtime data (configured entries), and
           * it's entirely absent unless an operator has opted in via
           * INGRESS_ENABLED - see docs/configuration-reference.md. */}
          {ingressEnabled && (
            <div className="mt-4 border-t border-surface-border pt-4">
              <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Ingress
              </p>
              {ingresses.map((entry) => (
                <a
                  key={entry.name}
                  href={`/ingress/${encodeURIComponent(entry.name)}/`}
                  target="_blank"
                  rel="noreferrer"
                  title={entry.description || entry.targetUrl}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-surface-800 hover:text-slate-200"
                >
                  <span className="truncate">{entry.name}</span>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 opacity-60">
                    <path d="M12.5 3a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0V4.81l-6.22 6.22a.75.75 0 1 1-1.06-1.06L14.19 3.75H12.5a.75.75 0 0 1-.75-.75Z" />
                    <path d="M4.5 4.75A1.75 1.75 0 0 1 6.25 3h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 15.75 16h-9.5A1.75 1.75 0 0 1 4.5 14.25v-9.5Z" />
                  </svg>
                </a>
              ))}
              {ingresses.length === 0 && (
                <p className="px-3 text-xs text-slate-500">No ingresses configured yet.</p>
              )}
              <NavLink
                to="/ingresses"
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-accent-600/15 text-accent-500'
                      : 'text-slate-400 hover:bg-surface-800 hover:text-slate-200'
                  }`
                }
              >
                Manage
              </NavLink>
            </div>
          )}
        </nav>

        <div className="border-t border-surface-border px-4 py-3">
          <p className="truncate text-xs text-slate-500">Signed in as</p>
          <p className="truncate text-sm text-slate-200">{user}</p>
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={() => void logout()}
              className="text-xs font-medium text-slate-400 hover:text-white"
            >
              Sign out
            </button>
            <a
              href="https://github.com/walnuss0815/vyos-client"
              target="_blank"
              rel="noreferrer"
              aria-label="View source on GitHub"
              title="View source on GitHub"
              className="text-slate-500 hover:text-slate-300"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M10 1.6a8.4 8.4 0 0 0-2.66 16.37c.42.08.57-.18.57-.4v-1.56c-2.34.5-2.83-1.02-2.83-1.02-.38-.97-.94-1.23-.94-1.23-.76-.53.06-.52.06-.52.85.06 1.3.87 1.3.87.75 1.3 1.98.92 2.46.7.08-.55.3-.92.53-1.13-1.87-.21-3.84-.94-3.84-4.17 0-.92.33-1.67.87-2.26-.09-.21-.38-1.08.08-2.24 0 0 .71-.23 2.33.86a8.05 8.05 0 0 1 4.24 0c1.62-1.1 2.33-.86 2.33-.86.46 1.16.17 2.03.08 2.24.54.59.87 1.34.87 2.26 0 3.24-1.97 3.95-3.85 4.16.3.27.58.79.58 1.6v2.36c0 .22.15.49.58.4A8.4 8.4 0 0 0 10 1.6Z"
                />
              </svg>
            </a>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto pt-14 pb-24 lg:pt-0">
        <ConfigWarningsBanner />
        <Outlet />
      </main>

      <PendingChangesBar />
    </div>
  )
}
