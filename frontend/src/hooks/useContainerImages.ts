import { useQuery } from '@tanstack/react-query'
import { getContainerImages } from '../lib/vyosApi'

/** Locally-present container images (`show container image json`) -
 * op-mode operational data, not configuration, so this deliberately
 * doesn't go through the usePendingChangesStore/commit pipeline at
 * all (see useContainerConfig.ts for the actual `container` config
 * tree this is a companion to). No auto-refresh: unlike Dashboard/
 * Interfaces/DHCP-leases, an image list doesn't change on its own -
 * ImagesPage.tsx refetches explicitly after a pull/delete completes. */
export function useContainerImages() {
  return useQuery({
    queryKey: ['container-images'],
    queryFn: getContainerImages,
    select: (res) => res.images,
  })
}
