import CertificateList from '../../components/pki/CertificateList'
import { usePKIConfig } from '../../hooks/usePKIConfig'

export default function CertificatesPage() {
  const { certificates, isLoading, isError } = usePKIConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load PKI configuration.</p>

  return <CertificateList certificates={certificates} isLoading={isLoading} />
}
