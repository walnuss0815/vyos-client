import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/container/containers', label: 'Containers' },
  { to: '/container/networks', label: 'Networks' },
  { to: '/container/registries', label: 'Registries' },
  { to: '/container/images', label: 'Images' },
]

/** Tab shell for Container - mirrors SystemLayout.tsx/FirewallLayout.tsx's
 * structure. Covers all three `container` config-tree tagNodes: individual
 * container definitions (Containers), user-defined Podman networks
 * (Networks), and registry auth/mirror settings (Registries). Confirmed
 * directly against vyos-1x's `container.xml.in` - unlike several earlier
 * areas, docs.vyos.io's prose page turned out accurate here, no staleness
 * correction needed.
 *
 * Images is different from the other three tabs: pulling/listing/deleting
 * container images (`add container image`/`show container image`/`delete
 * container image`) are VyOS op-mode commands, not part of `/configure` at
 * all - they're applied immediately via a dedicated `/container-image` REST
 * endpoint (backend/internal/vyos/container_image.go), not staged through
 * the pending-changes cart like the other three tabs. A container
 * definition on the Containers tab can reference an image that hasn't
 * actually been pulled yet - pull it here first. */
export default function ContainerLayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">Container</h1>
      <p className="mb-6 text-sm text-slate-400">
        Podman-based container definitions, user-defined networks, registry settings, and locally
        pulled images. Anything not covered here is still editable via the{' '}
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
