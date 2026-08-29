import IpsecCryptoGroups from '../../components/vpn/IpsecCryptoGroups'
import { useVpnConfig } from '../../hooks/useVpnConfig'

export default function IpsecCryptoPage() {
  const { ipsec, isLoading, isError } = useVpnConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load VPN configuration.</p>

  return <IpsecCryptoGroups config={ipsec} />
}
