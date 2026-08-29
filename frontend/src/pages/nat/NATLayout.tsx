import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/nat/source', label: 'Source' },
  { to: '/nat/destination', label: 'Destination' },
  { to: '/nat/static', label: 'Static' },
]

/** Tab shell for NAT - mirrors FirewallLayout.tsx/RoutingLayout.tsx's
 * structure. Covers NAT44 only (source, destination, and static/
 * 1-to-1 rules) - NAT64, NAT66/NPTv6, and CGNAT stay Config-Tree-only,
 * along with load-balancing backends, translation options, and
 * MAC-group/FQDN matching within NAT44 itself. See docs/roadmap.md. */
export default function NATLayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">NAT</h1>
      <p className="mb-6 text-sm text-slate-400">
        Network Address Translation (NAT44 only) - source NAT/masquerading, destination NAT/port
        forwards, and static one-to-one rules. NAT64, NAT66/NPTv6, CGNAT, and anything not covered
        here (load-balancing backends, translation options, MAC-group/FQDN matching, ...) are
        still editable via the{' '}
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
