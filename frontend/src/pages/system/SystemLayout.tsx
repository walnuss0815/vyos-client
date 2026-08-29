import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/system/general', label: 'General' },
  { to: '/system/users', label: 'Users' },
  { to: '/system/syslog', label: 'Syslog' },
  { to: '/system/power', label: 'Power' },
  { to: '/system/images', label: 'Images' },
]

/** Tab shell for System - mirrors FirewallLayout.tsx/RoutingLayout.tsx's
 * structure. Covers a "broader v1" slice of `system`: identity/DNS/
 * time zone plus static host mappings (General), local user accounts
 * plus SSH keys (Users - real synergy with AUTH_MODE=vyos-users, see
 * security.md), basic local/remote syslog (Syslog), immediate
 * reboot/poweroff (Power - op-mode commands, not configuration), and
 * VyOS release install/rollback (Images - `show/add/delete system
 * image`, entirely distinct from the Container area's own image
 * management). Everything else under `system` (sysctl, conntrack
 * tuning, IP/IPv6 global
 * options, task scheduler, console, watchdog, LCD, flow-accounting,
 * sFlow, acceleration, system proxy, OTP-MFA/RADIUS/TACACS+/login
 * banners/session limits, TLS-encrypted syslog, ...) is still
 * editable via the Config Tree page. */
export default function SystemLayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">System</h1>
      <p className="mb-6 text-sm text-slate-400">
        Host identity, DNS, and static host mappings; local user accounts and SSH keys; and basic
        syslog configuration. Anything not covered here (sysctl, task scheduler, watchdog, OTP/
        RADIUS/TACACS+ authentication, TLS-encrypted syslog, ...) is still editable via the{' '}
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
