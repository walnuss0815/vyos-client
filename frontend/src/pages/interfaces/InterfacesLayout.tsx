import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/interfaces/live', label: 'Live State' },
  { to: '/interfaces/ethernet', label: 'Ethernet' },
  { to: '/interfaces/bonding', label: 'Bonding' },
  { to: '/interfaces/bridge', label: 'Bridge' },
  { to: '/interfaces/vrfs', label: 'VRFs' },
]

/** Tab shell for everything interface-related: live operational state
 * (the original /interfaces page) alongside dedicated config forms for
 * Ethernet, Bonding, Bridge, and VRFs - mirrors FirewallLayout.tsx's
 * structure. Anything not covered by these config tabs (PPPoE,
 * WireGuard, wireless/WWAN, tunnels, EAPOL, ethtool-level tuning, ...)
 * is still editable via the Config Tree page. */
export default function InterfacesLayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">Interfaces</h1>
      <p className="mb-6 text-sm text-slate-400">
        Live state and configuration for Ethernet, Bonding, and Bridge interfaces, their VLAN
        sub-interfaces, and VRFs. Anything not covered here (PPPoE, WireGuard, wireless/WWAN,
        tunnels, ...) is still editable via the{' '}
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
