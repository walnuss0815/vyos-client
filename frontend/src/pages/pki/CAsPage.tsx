import CAList from '../../components/pki/CAList'
import { usePKIConfig } from '../../hooks/usePKIConfig'

export default function CAsPage() {
  const { cas, isLoading, isError } = usePKIConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load PKI configuration.</p>

  return <CAList cas={cas} isLoading={isLoading} />
}
