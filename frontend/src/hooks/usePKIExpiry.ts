import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPKIExpiry, type PKIExpiryEntry } from '../lib/vyosApi'

/**
 * Validity windows for every configured PKI certificate/CA, indexed by
 * name for O(1) lookup from CertificateList.tsx/CAList.tsx (each row
 * looks up its own entry, if any - a name not present in the map
 * simply renders no expiry badge, the same as a query still loading).
 * A distinct query key/fetch from usePKIConfig()'s generic config-tree
 * fetch, since this hits a dedicated backend endpoint that does real
 * X.509 parsing (see backend/internal/api/pki_handlers.go), not
 * another view of the same config-tree data.
 */
export function usePKIExpiry() {
  const query = useQuery({
    queryKey: ['pki-expiry'],
    queryFn: getPKIExpiry,
  })

  const certificates = useMemo(
    () => toNameMap(query.data?.certificates),
    [query.data],
  )
  const cas = useMemo(() => toNameMap(query.data?.cas), [query.data])

  return { ...query, certificates, cas }
}

function toNameMap(entries: PKIExpiryEntry[] | undefined): Map<string, PKIExpiryEntry> {
  return new Map((entries ?? []).map((entry) => [entry.name, entry]))
}
