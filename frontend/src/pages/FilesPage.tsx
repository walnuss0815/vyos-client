import { useState } from 'react'
import { useFileBrowserEntry, useFileBrowserRoots } from '../hooks/useFileBrowser'
import { downloadTextFile } from '../lib/downloadFile'
import { buttonClass } from '../lib/formStyles'

/** Joins a directory path and a child entry name - dir is always one
 * of the browsable roots or something nested under one, never "/"
 * itself, so a plain "dir/name" join (no special-casing a bare "/"
 * root) is always correct here. */
function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`
}

/** Clickable path segments from the browsable root down to `path`,
 * e.g. "/config/scripts/foo" -> [config, scripts, foo], each carrying
 * the full path clicking it should navigate to. */
function breadcrumbsFor(path: string): { label: string; path: string }[] {
  const segments = path.split('/').filter(Boolean)
  let acc = ''
  return segments.map((segment) => {
    acc = `${acc}/${segment}`
    return { label: segment, path: acc }
  })
}

const codeClass = 'rounded bg-surface-800 px-1 py-0.5 font-mono'

/** Read-only directory/file browser under a curated set of roots (see
 * useFileBrowserRoots) - `show file <path>`, VyOS's one general-
 * purpose op-mode command for this (no JSON form, no size limit, and
 * critically no path restriction of its own at all - this app's own
 * backend enforces the allowed roots, not VyOS). Clicking a directory
 * row navigates into it; clicking a file row shows its content (or a
 * hex dump for anything file(1) doesn't consider text) with a
 * Download button. There is no editor here and never will be one via
 * this endpoint - VyOS's REST API has no supported way to write
 * arbitrary file content back to an arbitrary path.
 *
 * Entirely disabled by default (FILE_BROWSER_ENABLED) - this page
 * always renders (the sidebar always links here, per Layout.tsx),
 * showing an explanatory disabled state rather than being hidden
 * outright, the same as UpgradesPage.tsx does for self-upgrade. */
export default function FilesPage() {
  const rootsQuery = useFileBrowserRoots()

  const [selectedPath, setSelectedPath] = useState<string | undefined>(undefined)

  if (rootsQuery.isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (rootsQuery.isError || !rootsQuery.data) {
    return <p className="text-sm text-danger-500">Failed to load the list of browsable directories.</p>
  }

  if (!rootsQuery.data.enabled) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
          <p className="mb-2 text-sm font-medium text-white">The file browser is disabled</p>
          <p className="text-sm text-slate-400">
            Set <code className={codeClass}>FILE_BROWSER_ENABLED=true</code> to turn this page on - see the
            configuration reference docs for details. Disabled by default since, even restricted to a curated set of
            directories, this is real filesystem read access on the router.
          </p>
        </div>
      </div>
    )
  }

  const roots = rootsQuery.data.roots
  const currentPath = selectedPath ?? roots[0]

  return <FilesBrowser roots={roots} currentPath={currentPath} setSelectedPath={setSelectedPath} />
}

function FilesBrowser({
  roots,
  currentPath,
  setSelectedPath,
}: {
  roots: string[]
  currentPath: string | undefined
  setSelectedPath: (path: string) => void
}) {
  const entryQuery = useFileBrowserEntry(currentPath)
  const entry = entryQuery.data

  function handleDownload() {
    if (!entry || entry.isDirectory || !currentPath) return
    const name = currentPath.split('/').filter(Boolean).pop() ?? 'file'
    downloadTextFile(name, entry.content ?? '')
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="mb-1 text-lg font-semibold text-white">Files</h1>
        <p className="text-sm text-slate-400">
          Browse and view files under a curated set of directories on the router. Read-only:
          VyOS's REST API has no supported way to write arbitrary file content back to an
          arbitrary path - use the Config Tree page's import/export for configuration changes.
        </p>
      </div>

      <div className="mb-4 flex gap-1 border-b border-surface-border">
        {roots.map((root) => (
          <button
            key={root}
            onClick={() => setSelectedPath(root)}
            className={`border-b-2 px-3 py-2 font-mono text-sm font-medium transition ${
              currentPath === root || currentPath?.startsWith(`${root}/`)
                ? 'border-accent-500 text-accent-500'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {root}
          </button>
        ))}
      </div>

      {currentPath && (
        <nav className="mb-4 flex flex-wrap items-center gap-1 font-mono text-xs text-slate-400">
          {breadcrumbsFor(currentPath).map((crumb, i, arr) => (
            <span key={crumb.path} className="flex items-center gap-1">
              <button
                onClick={() => setSelectedPath(crumb.path)}
                disabled={crumb.path === currentPath}
                className={crumb.path === currentPath ? 'text-white' : 'hover:text-accent-500'}
              >
                {crumb.label}
              </button>
              {i < arr.length - 1 && <span>/</span>}
            </span>
          ))}
        </nav>
      )}

      {entryQuery.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {entryQuery.isError && <p className="text-sm text-danger-500">Failed to load {currentPath}.</p>}

      {entry && entry.isDirectory && (
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-800 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Permissions</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Modified</th>
              </tr>
            </thead>
            <tbody>
              {(entry.entries ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-xs text-slate-500">
                    This directory is empty.
                  </td>
                </tr>
              )}
              {(entry.entries ?? []).map((row) => (
                <tr key={row.name} className="border-t border-surface-border">
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setSelectedPath(joinPath(currentPath!, row.name))}
                      className="font-mono text-xs text-white hover:text-accent-500"
                    >
                      {row.name}
                      {row.isDir && '/'}
                    </button>
                    {row.linkTarget && (
                      <span className="ml-1 font-mono text-xs text-slate-500">-&gt; {row.linkTarget}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{row.permissions}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{row.size}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{row.modified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entry && !entry.isDirectory && (
        <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-400">
              {entry.type && <span>{entry.type}</span>}
              {entry.owner && <span> · owner {entry.owner}</span>}
              {entry.modified && <span> · modified {entry.modified}</span>}
            </div>
            <button onClick={handleDownload} className={`bg-accent-600 ${buttonClass}`}>
              Download
            </button>
          </div>
          {entry.isBinary && (
            <p className="mb-2 text-xs text-slate-500">
              Binary file - showing a hex dump instead of raw content.
            </p>
          )}
          {entry.truncated && (
            <p className="mb-2 text-xs text-slate-500">
              Content truncated - this file is larger than what this app will display inline.
            </p>
          )}
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-all rounded bg-surface-950 p-3 font-mono text-xs text-slate-300">
            {entry.content}
          </pre>
        </div>
      )}
    </div>
  )
}
