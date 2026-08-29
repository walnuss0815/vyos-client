import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/vpn/ipsec-crypto', label: 'IPsec Crypto Groups' },
  { to: '/vpn/ipsec-site-to-site', label: 'IPsec Site-to-Site' },
  { to: '/vpn/ipsec-remote-access', label: 'IPsec Remote Access' },
  { to: '/vpn/ipsec-settings', label: 'IPsec Settings' },
  { to: '/vpn/l2tp', label: 'L2TP' },
  { to: '/vpn/pptp', label: 'PPTP' },
  { to: '/vpn/sstp', label: 'SSTP' },
  { to: '/vpn/openconnect', label: 'OpenConnect' },
]

/** Tab shell for VPN - mirrors ServiceLayout.tsx's structure. Covers
 * the full `vpn` config tree per explicit product decision (see the
 * questions asked before implementation): IPsec (crypto groups,
 * site-to-site, remote-access/IKEv2, settings), L2TP/PPTP/SSTP
 * (accel-ppp based remote-access VPN servers, sharing a common field
 * shape - see lib/vpnAccelPppTypes.ts's doc comment), and OpenConnect
 * (AnyConnect-compatible SSL VPN server).
 *
 * Deliberately excludes `vpn ipsec profile` (DMVPN/NHRP glue - depends
 * on `protocols nhrp`, out of scope until DMVPN itself is built) - see
 * vpnIpsecTypes.ts's doc comment. `rsa-keys` no longer exists in
 * current VyOS (removed in favor of x509 certificates) - the
 * roadmap's original mention of it was stale prose, corrected here. */
export default function VpnLayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">VPN</h1>
      <p className="mb-6 text-sm text-slate-400">
        IPsec (site-to-site and IKEv2 remote-access), plus L2TP/PPTP/SSTP and OpenConnect
        remote-access VPN servers. Anything not covered here (DMVPN/NHRP profiles) is still
        editable via the{' '}
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
