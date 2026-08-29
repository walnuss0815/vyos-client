import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/dhcp/leases', label: 'Leases' },
  { to: '/dhcp/networks', label: 'Networks' },
]

/** Tab shell for DHCP: live leases (the original /dhcp page) alongside
 * a dedicated config tab for shared networks/subnets/ranges/static
 * mappings - mirrors InterfacesLayout.tsx's structure. Anything not
 * covered by the Networks tab (the long tail of DHCP options, dynamic
 * DNS, High Availability, relay-agent-information/client-class
 * matching, DHCPv6, ...) is still editable via the Config Tree page. */
export default function DHCPLayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">DHCP</h1>
      <p className="mb-6 text-sm text-slate-400">
        Live leases and shared-network/subnet configuration. Anything not covered here (the long
        tail of DHCP options, dynamic DNS, High Availability, DHCPv6, ...) is still editable via
        the{' '}
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
