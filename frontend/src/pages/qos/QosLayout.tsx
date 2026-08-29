import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/qos/policies', label: 'Policies' },
  { to: '/qos/interfaces', label: 'Interfaces' },
  { to: '/qos/match-groups', label: 'Match Groups' },
]

/** Tab shell for Traffic Policy / QoS - mirrors High Availability's/
 * Load-balancing's tab-shell structure. VyOS's config-tree root was
 * renamed from `traffic-policy` to `qos` in 2022 (confirmed against
 * vyos-1x's interface-definitions/qos.xml.in) - this app uses the
 * current name for the config path but keeps "Traffic Policy / QoS"
 * as the nav label since that's the more commonly recognized term.
 *
 * Per an explicit scoping decision, this covers 8 of VyOS's 12 policy
 * types - `shaper`/`shaper-hfsc` (classful bandwidth shaping),
 * `limiter` (the only ingress-capable type), `cake`/`fq-codel`
 * (modern non-classful AQM), and `priority-queue`/`round-robin`/
 * `rate-control` - deliberately excluding `drop-tail`/`fair-queue`/
 * `random-detect`/`network-emulator` (the last being a link-impairment
 * testing tool, not real QoS) - see docs/roadmap.md's "Not yet built"
 * note. True ingress *shaping* (via an IFB pseudo-interface) is also
 * out of scope for now - only `limiter`-based ingress *policing* is
 * covered. */
export default function QosLayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">Traffic Policy / QoS</h1>
      <p className="mb-6 text-sm text-slate-400">
        Bandwidth shaping, ingress policing, and queueing policies, plus which interfaces they're
        applied to. Anything not covered here is still editable via the{' '}
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
