import KeyMaterialSection from '../../components/pki/KeyMaterialSection'
import { usePKIConfig } from '../../hooks/usePKIConfig'

export default function KeyMaterialPage() {
  const { keyPairs, dhParams, isLoading, isError } = usePKIConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load PKI configuration.</p>

  return <KeyMaterialSection keyPairs={keyPairs} dhParams={dhParams} isLoading={isLoading} />
}
