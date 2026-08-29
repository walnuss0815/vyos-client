import AccelPppServer from '../../components/vpn/AccelPppServer'
import { useVpnConfig } from '../../hooks/useVpnConfig'

export default function SstpPage() {
  const { sstp, isLoading, isError } = useVpnConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load VPN configuration.</p>

  return <AccelPppServer kind="sstp" config={sstp} />
}
