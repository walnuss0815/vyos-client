import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/high-availability/vrrp', label: 'VRRP' },
  { to: '/high-availability/conntrack-sync', label: 'Conntrack-sync' },
]

/** Tab shell for High Availability - mirrors Load-balancing's
 * LoadBalancingLayout.tsx structure. Covers `high-availability vrrp`
 * (VRRP groups/sync-groups) and the separate `service conntrack-sync`
 * tree - two related-but-distinct config trees, linked only by one
 * cross-reference field (conntrack-sync's `failover-mechanism vrrp
 * sync-group`), confirmed directly against vyos-1x's own
 * interface-definitions. Deliberately excludes `high-availability
 * virtual-server` - an unrelated IPVS/LVS load-balancer feature that
 * happens to share the same XML parent node but has nothing to do
 * with VRRP/conntrack-sync (and would collide in name with this app's
 * own "Load-balancing" nav item) - see docs/roadmap.md's "Not yet
 * built" note. */
export default function HighAvailabilityLayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">High Availability</h1>
      <p className="mb-6 text-sm text-slate-400">
        VRRP failover between routers and conntrack-sync's stateful firewall-session
        replication - two related but separately-configured VyOS features. Anything not covered
        here is still editable via the{' '}
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
