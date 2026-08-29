import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/policy/prefix-lists', label: 'Prefix Lists' },
  { to: '/policy/lists', label: 'Lists' },
  { to: '/policy/route-maps', label: 'Route Maps' },
  { to: '/policy/local-route', label: 'Local Route' },
]

/** Tab shell for Policy - mirrors FirewallLayout.tsx/RoutingLayout.tsx's
 * structure. Covers a "broader v1" slice of `policy`: prefix lists
 * (v4/v6), as-path/community/extended-community/large-community
 * lists, a curated core of route-map's 60+ match/set options, and
 * local-route (policy-based routing). Access-lists stay Config-Tree-
 * only - prefix-lists are the modern, preferred equivalent for most
 * use cases. See docs/roadmap.md for the full scope. */
export default function PolicyLayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">Policy</h1>
      <p className="mb-6 text-sm text-slate-400">
        Prefix lists, AS-path/community lists, route-maps (a curated core of options), and
        local-route policy-based routing. Referenced by BGP/OSPF redistribution and neighbor
        filtering. Anything not covered here (access-lists, route-map's full match/set surface,
        ...) is still editable via the{' '}
        <NavLink to="/config-tree" className="text-accent-500 hover:text-accent-400">
          Config Tree
        </NavLink>{' '}
        page.
      </p>

      <div className="mb-6 flex gap-1 border-b border-surface-border">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `border-b-2 px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? 'border-accent-500 text-accent-500'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  )
}
