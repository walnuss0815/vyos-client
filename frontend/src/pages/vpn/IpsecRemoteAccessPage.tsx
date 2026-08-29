import IpsecRemoteAccess from '../../components/vpn/IpsecRemoteAccess'
import { useVpnConfig } from '../../hooks/useVpnConfig'

export default function IpsecRemoteAccessPage() {
  const { ipsec, isLoading, isError } = useVpnConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load VPN configuration.</p>

  return <IpsecRemoteAccess config={ipsec} />
}
