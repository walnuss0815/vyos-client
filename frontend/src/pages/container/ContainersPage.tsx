import ContainerList from '../../components/container/ContainerList'
import { useContainerConfig } from '../../hooks/useContainerConfig'

export default function ContainersPage() {
  const { containers, networks, isLoading, isError } = useContainerConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load container configuration.</p>

  return <ContainerList containers={containers} networks={networks} isLoading={isLoading} />
}
