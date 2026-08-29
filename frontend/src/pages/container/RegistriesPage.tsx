import RegistryList from '../../components/container/RegistryList'
import { useContainerConfig } from '../../hooks/useContainerConfig'

export default function RegistriesPage() {
  const { registries, isLoading, isError } = useContainerConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load container configuration.</p>

  return <RegistryList registries={registries} isLoading={isLoading} />
}
