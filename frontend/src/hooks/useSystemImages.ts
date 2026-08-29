import { useQuery } from '@tanstack/react-query'
import { getSystemImages } from '../lib/vyosApi'

/** VyOS releases installed on this router (`show system image`) -
 * op-mode operational data, not configuration, so this deliberately
 * doesn't go through the usual pending-changes-cart/commit pipeline
 * at all (see useContainerImages.ts for the identical pattern, and
 * ImagesPage.tsx under System for the page this backs). No
 * auto-refresh: like the container image list, this doesn't change on
 * its own - the page refetches explicitly after an install/delete/
 * default-boot change completes. */
export function useSystemImages() {
  return useQuery({
    queryKey: ['system-images'],
    queryFn: getSystemImages,
    select: (res) => res.images,
  })
}
