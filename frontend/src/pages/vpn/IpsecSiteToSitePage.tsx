import IpsecSiteToSite from '../../components/vpn/IpsecSiteToSite'
import { useVpnConfig } from '../../hooks/useVpnConfig'

export default function IpsecSiteToSitePage() {
  const { ipsec, isLoading, isError } = useVpnConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load VPN configuration.</p>

  return <IpsecSiteToSite config={ipsec} />
}
