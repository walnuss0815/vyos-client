import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/firewall/zones', label: 'Zones' },
  { to: '/firewall/rulesets', label: 'Rulesets' },
  { to: '/firewall/groups', label: 'Groups' },
  { to: '/firewall/global-options', label: 'Global options' },
]

export default function FirewallLayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">Firewall</h1>
      <p className="mb-6 text-sm text-slate-400">
        Zones, rulesets (IPv4 and IPv6), groups, and global options. Anything not covered here
        (geoip matching, dynamic/remote groups, per-rule logging detail, IPv6's own
        ipv6-address-group/ipv6-network-group definitions, ...) is still editable via the{' '}
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
