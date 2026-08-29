import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/load-balancing/wan', label: 'WAN' },
  { to: '/load-balancing/haproxy', label: 'HAProxy' },
]

/** Tab shell for Load Balancing - mirrors SystemLayout.tsx/
 * FirewallLayout.tsx/ContainerLayout.tsx's structure. Covers VyOS's
 * two entirely separate `load-balancing` config sub-trees: `wan`
 * (multi-uplink failover/distribution across several WAN interfaces)
 * and `haproxy` (a TCP/HTTP reverse-proxy) - unrelated features that
 * merely share a common top-level config-tree prefix in VyOS. Both
 * tabs also show a live op-mode status panel (WAN interface health /
 * HAProxy backend status) sourced from `show wan-load-balance`/`show
 * load-balancing haproxy` - see docs/architecture.md's "Load-balancing"
 * section for why that data has no JSON form and had to be text-parsed
 * server-side, the same class of problem Files/Logs already solved.
 *
 * The nav label/page title is "Load Balancing" (space) - only the
 * user-facing text was renamed from the original "Load-balancing";
 * the route (`/load-balancing`), VyOS config-tree path segments, and
 * every internal identifier still use the hyphenated form, matching
 * VyOS's own naming. */
export default function LoadBalancingLayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">Load Balancing</h1>
      <p className="mb-6 text-sm text-slate-400">
        WAN multi-uplink failover/distribution and the HAProxy TCP/HTTP reverse-proxy - two
        unrelated features under one config-tree prefix. Anything not covered here is still
        editable via the{' '}
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
