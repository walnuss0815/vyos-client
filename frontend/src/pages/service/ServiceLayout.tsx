import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/service/ntp', label: 'NTP' },
  { to: '/service/ssh', label: 'SSH' },
  { to: '/service/https', label: 'HTTPS API' },
  { to: '/service/dhcp-relay', label: 'DHCP Relay' },
  { to: '/service/dns-forwarding', label: 'DNS Forwarding' },
  { to: '/service/dns-dynamic', label: 'Dynamic DNS' },
  { to: '/service/router-advert', label: 'Router Advertisements' },
  { to: '/service/dhcpv6-server', label: 'DHCPv6 Server' },
  { to: '/service/snmp', label: 'SNMP' },
  { to: '/service/tftp', label: 'TFTP' },
  { to: '/service/broadcast-relay', label: 'Broadcast Relay' },
  { to: '/service/mdns', label: 'mDNS Repeater' },
  { to: '/service/lldp', label: 'LLDP' },
  { to: '/service/ndp-proxy', label: 'NDP Proxy' },
  { to: '/service/event-handler', label: 'Event Handler' },
  { to: '/service/console-server', label: 'Console Server' },
  { to: '/service/monitoring', label: 'Monitoring' },
]

/** Tab shell for Service - mirrors SystemLayout.tsx/ContainerLayout.tsx's
 * structure. Covers a curated batch of `service` sub-areas, picked from
 * the much larger `service` config tree (~30 sub-services) per explicit
 * product decision (see the questions asked before implementation):
 * NTP, SSH, the HTTPS API itself, DHCP/DHCPv6 relay, DNS forwarding
 * (core), Dynamic DNS, Router Advertisements (IPv6 SLAAC), DHCPv6
 * server, and SNMP (v1/v2c only). Each tab covers a curated core of its
 * area, not full coverage - see each area's own lib module doc comment
 * for exactly what's excluded and why. Everything else under `service`
 * (DNS forwarding's full authoritative-zone feature, SNMPv3, LLDP, mDNS
 * repeater, webproxy, TFTP, broadcast-relay, IPoE/PPPoE server,
 * Suricata, monitoring exporters, config-sync, event-handler, stunnel,
 * NDP proxy, and more) is still editable via the Config Tree page. */
export default function ServiceLayout() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-white">Service</h1>
      <p className="mb-6 text-sm text-slate-400">
        NTP time sync, SSH access, the HTTPS API this app itself uses, DHCP/DHCPv6 relay, DNS
        forwarding, Dynamic DNS, IPv6 Router Advertisements, DHCPv6 server, and SNMP monitoring.
        Anything not covered here is still editable via the{' '}
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
