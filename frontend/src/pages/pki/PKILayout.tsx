import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/pki/cas', label: 'Certificate Authorities' },
  { to: '/pki/certificates', label: 'Certificates' },
  { to: '/pki/key-material', label: 'Key Material' },
  { to: '/pki/defaults', label: 'Defaults' },
]

/** Tab shell for PKI - mirrors FirewallLayout.tsx/RoutingLayout.tsx's
 * structure. Deliberately storage-only: pasting in already-obtained
 * PEM certificates/keys and managing their metadata, not a
 * certificate-generation workflow - VyOS's own key/cert generation
 * happens via interactive op-mode commands this app doesn't wrap. See
 * docs/roadmap.md and lib/pkiTypes.ts's doc comment for the full
 * rationale and scope. */
export default function PKILayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">Public Key Infrastructure (PKI)</h1>
      <p className="mb-6 text-sm text-slate-400">
        Store already-obtained certificates and keys (from a CA,
        ACME, or VyOS's own <code>generate pki ...</code> CLI commands) for use by this app's own
        TLS story, syslog's TLS remote logging, WireGuard, and more. Certificate/key{' '}
        <em>generation</em> itself isn't covered here - paste in PEM material you already have.
        Anything not covered here (SSH host keys, OpenVPN shared secrets, ...) is still editable
        via the{' '}
        <NavLink to="/config-tree" className="text-accent-500 hover:text-accent-400">
          Config Tree
        </NavLink>{' '}
        page.
      </p>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-surface-border">
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
