import QosInterfaceBindingsList from '../../components/qos/QosInterfaceBindingsList'
import { useQosConfig } from '../../hooks/useQosConfig'

export default function InterfacesPage() {
  const qos = useQosConfig()

  if (qos.isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (qos.isError) return <p className="text-sm text-danger-500">Failed to load QoS configuration.</p>

  return <QosInterfaceBindingsList qos={qos} />
}
