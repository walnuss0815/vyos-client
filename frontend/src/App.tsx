import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { useApplyTheme } from './hooks/useApplyTheme'
import ConfigTreePage from './pages/ConfigTreePage'
import DashboardPage from './pages/DashboardPage'
import ContainerLayout from './pages/container/ContainerLayout'
import ContainersPage from './pages/container/ContainersPage'
import ContainerNetworksPage from './pages/container/NetworksPage'
import RegistriesPage from './pages/container/RegistriesPage'
import ImagesPage from './pages/container/ImagesPage'
import DHCPLayout from './pages/dhcp/DHCPLayout'
import LeasesPage from './pages/dhcp/LeasesPage'
import NetworksPage from './pages/dhcp/NetworksPage'
import FirewallLayout from './pages/firewall/FirewallLayout'
import GlobalOptionsPage from './pages/firewall/GlobalOptionsPage'
import GroupsPage from './pages/firewall/GroupsPage'
import RulesetDetailPage from './pages/firewall/RulesetDetailPage'
import RulesetsPage from './pages/firewall/RulesetsPage'
import ZonesPage from './pages/firewall/ZonesPage'
import BondingPage from './pages/interfaces/BondingPage'
import BridgePage from './pages/interfaces/BridgePage'
import EthernetPage from './pages/interfaces/EthernetPage'
import InterfacesLayout from './pages/interfaces/InterfacesLayout'
import LiveStatePage from './pages/interfaces/LiveStatePage'
import VrfPage from './pages/interfaces/VrfPage'
import LoginPage from './pages/LoginPage'
import LogsPage from './pages/LogsPage'
import FilesPage from './pages/FilesPage'
import DestinationRulesPage from './pages/nat/DestinationRulesPage'
import NATLayout from './pages/nat/NATLayout'
import SourceRulesPage from './pages/nat/SourceRulesPage'
import StaticRulesPage from './pages/nat/StaticRulesPage'
import LoadBalancingLayout from './pages/loadbalancing/LoadBalancingLayout'
import WanPage from './pages/loadbalancing/WanPage'
import HaproxyPage from './pages/loadbalancing/HaproxyPage'
import HighAvailabilityLayout from './pages/highavailability/HighAvailabilityLayout'
import VrrpPage from './pages/highavailability/VrrpPage'
import ConntrackSyncPage from './pages/highavailability/ConntrackSyncPage'
import QosLayout from './pages/qos/QosLayout'
import PoliciesPage from './pages/qos/PoliciesPage'
import InterfacesPage from './pages/qos/InterfacesPage'
import MatchGroupsPage from './pages/qos/MatchGroupsPage'
import ListsPage from './pages/policy/ListsPage'
import LocalRoutePage from './pages/policy/LocalRoutePage'
import PolicyLayout from './pages/policy/PolicyLayout'
import PrefixListsPage from './pages/policy/PrefixListsPage'
import RouteMapsPage from './pages/policy/RouteMapsPage'
import CAsPage from './pages/pki/CAsPage'
import CertificatesPage from './pages/pki/CertificatesPage'
import DefaultsPage from './pages/pki/DefaultsPage'
import KeyMaterialPage from './pages/pki/KeyMaterialPage'
import PKILayout from './pages/pki/PKILayout'
import BGPPage from './pages/routing/BGPPage'
import LiveRoutesPage from './pages/routing/LiveRoutesPage'
import OSPFPage from './pages/routing/OSPFPage'
import RoutingLayout from './pages/routing/RoutingLayout'
import StaticRoutesPage from './pages/routing/StaticRoutesPage'
import BroadcastRelayPage from './pages/service/BroadcastRelayPage'
import ConsoleServerPage from './pages/service/ConsoleServerPage'
import DhcpRelayPage from './pages/service/DhcpRelayPage'
import Dhcpv6ServerPage from './pages/service/Dhcpv6ServerPage'
import DnsDynamicPage from './pages/service/DnsDynamicPage'
import DnsForwardingPage from './pages/service/DnsForwardingPage'
import EventHandlerPage from './pages/service/EventHandlerPage'
import HttpsPage from './pages/service/HttpsPage'
import LldpPage from './pages/service/LldpPage'
import MdnsPage from './pages/service/MdnsPage'
import MonitoringPage from './pages/service/MonitoringPage'
import NdpProxyPage from './pages/service/NdpProxyPage'
import NtpPage from './pages/service/NtpPage'
import RouterAdvertPage from './pages/service/RouterAdvertPage'
import ServiceLayout from './pages/service/ServiceLayout'
import SnmpPage from './pages/service/SnmpPage'
import SshPage from './pages/service/SshPage'
import TftpPage from './pages/service/TftpPage'
import GeneralPage from './pages/system/GeneralPage'
import SystemImagesPage from './pages/system/ImagesPage'
import PowerPage from './pages/system/PowerPage'
import SyslogPage from './pages/system/SyslogPage'
import SystemLayout from './pages/system/SystemLayout'
import UpgradesPage from './pages/system/UpgradesPage'
import UsersPage from './pages/system/UsersPage'
import IpsecCryptoPage from './pages/vpn/IpsecCryptoPage'
import IpsecRemoteAccessPage from './pages/vpn/IpsecRemoteAccessPage'
import IpsecSettingsPage from './pages/vpn/IpsecSettingsPage'
import IpsecSiteToSitePage from './pages/vpn/IpsecSiteToSitePage'
import L2tpPage from './pages/vpn/L2tpPage'
import OpenconnectPage from './pages/vpn/OpenconnectPage'
import PptpPage from './pages/vpn/PptpPage'
import SstpPage from './pages/vpn/SstpPage'
import VpnLayout from './pages/vpn/VpnLayout'

export default function App() {
  // Applies to every route, including the unauthenticated login page -
  // see the hook's doc comment for why this lives here rather than in
  // Layout (which only wraps authenticated routes).
  useApplyTheme()

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />

          <Route path="/firewall" element={<FirewallLayout />}>
            <Route index element={<Navigate to="zones" replace />} />
            <Route path="zones" element={<ZonesPage />} />
            <Route path="rulesets" element={<RulesetsPage />} />
            <Route path="rulesets/:family/:kind/:id" element={<RulesetDetailPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="global-options" element={<GlobalOptionsPage />} />
          </Route>

          <Route path="/dhcp" element={<DHCPLayout />}>
            <Route index element={<Navigate to="leases" replace />} />
            <Route path="leases" element={<LeasesPage />} />
            <Route path="networks" element={<NetworksPage />} />
          </Route>

          <Route path="/interfaces" element={<InterfacesLayout />}>
            <Route index element={<Navigate to="live" replace />} />
            <Route path="live" element={<LiveStatePage />} />
            <Route path="ethernet" element={<EthernetPage />} />
            <Route path="bonding" element={<BondingPage />} />
            <Route path="bridge" element={<BridgePage />} />
            <Route path="vrfs" element={<VrfPage />} />
          </Route>

          <Route path="/routes" element={<RoutingLayout />}>
            <Route index element={<Navigate to="live" replace />} />
            <Route path="live" element={<LiveRoutesPage />} />
            <Route path="static" element={<StaticRoutesPage />} />
            <Route path="bgp" element={<BGPPage />} />
            <Route path="ospf" element={<OSPFPage />} />
          </Route>

          <Route path="/nat" element={<NATLayout />}>
            <Route index element={<Navigate to="source" replace />} />
            <Route path="source" element={<SourceRulesPage />} />
            <Route path="destination" element={<DestinationRulesPage />} />
            <Route path="static" element={<StaticRulesPage />} />
          </Route>

          <Route path="/load-balancing" element={<LoadBalancingLayout />}>
            <Route index element={<Navigate to="wan" replace />} />
            <Route path="wan" element={<WanPage />} />
            <Route path="haproxy" element={<HaproxyPage />} />
          </Route>

          <Route path="/high-availability" element={<HighAvailabilityLayout />}>
            <Route index element={<Navigate to="vrrp" replace />} />
            <Route path="vrrp" element={<VrrpPage />} />
            <Route path="conntrack-sync" element={<ConntrackSyncPage />} />
          </Route>

          <Route path="/qos" element={<QosLayout />}>
            <Route index element={<Navigate to="policies" replace />} />
            <Route path="policies" element={<PoliciesPage />} />
            <Route path="interfaces" element={<InterfacesPage />} />
            <Route path="match-groups" element={<MatchGroupsPage />} />
          </Route>

          <Route path="/policy" element={<PolicyLayout />}>
            <Route index element={<Navigate to="prefix-lists" replace />} />
            <Route path="prefix-lists" element={<PrefixListsPage />} />
            <Route path="lists" element={<ListsPage />} />
            <Route path="route-maps" element={<RouteMapsPage />} />
            <Route path="local-route" element={<LocalRoutePage />} />
          </Route>

          <Route path="/pki" element={<PKILayout />}>
            <Route index element={<Navigate to="cas" replace />} />
            <Route path="cas" element={<CAsPage />} />
            <Route path="certificates" element={<CertificatesPage />} />
            <Route path="key-material" element={<KeyMaterialPage />} />
            <Route path="defaults" element={<DefaultsPage />} />
          </Route>

          <Route path="/service" element={<ServiceLayout />}>
            <Route index element={<Navigate to="ntp" replace />} />
            <Route path="ntp" element={<NtpPage />} />
            <Route path="dhcp-relay" element={<DhcpRelayPage />} />
            <Route path="ssh" element={<SshPage />} />
            <Route path="https" element={<HttpsPage />} />
            <Route path="dns-dynamic" element={<DnsDynamicPage />} />
            <Route path="dns-forwarding" element={<DnsForwardingPage />} />
            <Route path="router-advert" element={<RouterAdvertPage />} />
            <Route path="dhcpv6-server" element={<Dhcpv6ServerPage />} />
            <Route path="snmp" element={<SnmpPage />} />
            <Route path="tftp" element={<TftpPage />} />
            <Route path="broadcast-relay" element={<BroadcastRelayPage />} />
            <Route path="mdns" element={<MdnsPage />} />
            <Route path="lldp" element={<LldpPage />} />
            <Route path="ndp-proxy" element={<NdpProxyPage />} />
            <Route path="event-handler" element={<EventHandlerPage />} />
            <Route path="console-server" element={<ConsoleServerPage />} />
            <Route path="monitoring" element={<MonitoringPage />} />
          </Route>
          <Route path="/system" element={<SystemLayout />}>
            <Route index element={<Navigate to="general" replace />} />
            <Route path="general" element={<GeneralPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="syslog" element={<SyslogPage />} />
            <Route path="power" element={<PowerPage />} />
            <Route path="images" element={<SystemImagesPage />} />
            <Route path="upgrades" element={<UpgradesPage />} />
          </Route>
          <Route path="/container" element={<ContainerLayout />}>
            <Route index element={<Navigate to="containers" replace />} />
            <Route path="containers" element={<ContainersPage />} />
            <Route path="networks" element={<ContainerNetworksPage />} />
            <Route path="registries" element={<RegistriesPage />} />
            <Route path="images" element={<ImagesPage />} />
          </Route>
          <Route path="/vpn" element={<VpnLayout />}>
            <Route index element={<Navigate to="ipsec-crypto" replace />} />
            <Route path="ipsec-crypto" element={<IpsecCryptoPage />} />
            <Route path="ipsec-site-to-site" element={<IpsecSiteToSitePage />} />
            <Route path="ipsec-remote-access" element={<IpsecRemoteAccessPage />} />
            <Route path="ipsec-settings" element={<IpsecSettingsPage />} />
            <Route path="l2tp" element={<L2tpPage />} />
            <Route path="pptp" element={<PptpPage />} />
            <Route path="sstp" element={<SstpPage />} />
            <Route path="openconnect" element={<OpenconnectPage />} />
          </Route>
          <Route path="/config-tree" element={<ConfigTreePage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/files" element={<FilesPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
