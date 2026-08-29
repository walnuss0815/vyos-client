import X509DefaultsForm from '../../components/pki/X509DefaultsForm'
import { usePKIConfig } from '../../hooks/usePKIConfig'

export default function DefaultsPage() {
  const { x509Defaults, isLoading, isError } = usePKIConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load PKI configuration.</p>

  return <X509DefaultsForm defaults={x509Defaults} />
}
