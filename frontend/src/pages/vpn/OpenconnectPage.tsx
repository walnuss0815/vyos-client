import OpenconnectServer from '../../components/vpn/OpenconnectServer'
import { useVpnConfig } from '../../hooks/useVpnConfig'

export default function OpenconnectPage() {
  const { openconnect, isLoading, isError } = useVpnConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load VPN configuration.</p>

  return <OpenconnectServer config={openconnect} />
}
