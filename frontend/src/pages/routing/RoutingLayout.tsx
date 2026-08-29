import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/routes/live', label: 'Live Routes' },
  { to: '/routes/static', label: 'Static Routes' },
  { to: '/routes/bgp', label: 'BGP' },
  { to: '/routes/ospf', label: 'OSPF' },
]

/** Tab shell for routing: live routing tables (the original /routes
 * page, sourced from FRR via VyOS's operational data) alongside
 * dedicated config tabs for static routes, BGP, and OSPF(v3) - mirrors
 * FirewallLayout.tsx/InterfacesLayout.tsx/DHCPLayout.tsx's structure.
 * Anything not covered by these tabs (BFD monitoring, SRv6 segments,
 * BGP dampening/VRF/EVPN, OSPF virtual-links/segment-routing/MPLS-TE,
 * RIP/IS-IS/other protocols, ...) is still editable via the Config
 * Tree page. */
export default function RoutingLayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">Routing</h1>
      <p className="mb-6 text-sm text-slate-400">
        Live routing tables, static route configuration, BGP, and OSPF/OSPFv3. Anything not
        covered here (BFD monitoring, SRv6 segments, BGP dampening/VRF/EVPN, OSPF virtual-links/
        segment-routing, other routing protocols, ...) is still editable via the{' '}
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
