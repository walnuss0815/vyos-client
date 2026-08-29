import { useQuery } from '@tanstack/react-query'
import { getFile, getFileBrowserRoots } from '../lib/vyosApi'

/** The closed set of directories the Files page may browse (see
 * backend/internal/api/file_handlers.go's fileBrowserRoots) - fetched
 * rather than hardcoded so the frontend can't drift from whatever the
 * backend actually enforces. */
export function useFileBrowserRoots() {
  return useQuery({
    queryKey: ['file-browser-roots'],
    queryFn: getFileBrowserRoots,
    select: (res) => res.roots,
  })
}

/** A single `show file <path>` result - a directory listing or a file
 * view, whichever the path turned out to be (see
 * vyosApi.ts's FileBrowserResult). Disabled until a path is picked
 * (e.g. while useFileBrowserRoots is still loading and the page hasn't
 * settled on a starting root yet). */
export function useFileBrowserEntry(path: string | undefined) {
  return useQuery({
    queryKey: ['file-browser', path],
    queryFn: () => getFile(path as string),
    enabled: path !== undefined,
  })
}
