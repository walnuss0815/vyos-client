import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import ImportConfigPanel from '../components/ImportConfigPanel'
import TreeNode from '../components/TreeNode'
import { downloadTextFile, exportTimestamp } from '../lib/downloadFile'
import { getConfigTree, getSetCommands } from '../lib/vyosApi'

export default function ConfigTreePage() {
  const [view, setView] = useState<'tree' | 'commands' | 'import'>('tree')

  const treeQuery = useQuery({
    queryKey: ['config-tree'],
    queryFn: () => getConfigTree([]),
    enabled: view === 'tree',
  })
  const commandsQuery = useQuery({
    queryKey: ['set-commands'],
    queryFn: () => getSetCommands(),
    enabled: view === 'commands',
  })

  function downloadSetCommands() {
    if (!commandsQuery.data) return
    downloadTextFile(`vyos-config-${exportTimestamp()}.txt`, commandsQuery.data.text)
  }

  function downloadJson() {
    if (!treeQuery.data) return
    downloadTextFile(
      `vyos-config-${exportTimestamp()}.json`,
      JSON.stringify(treeQuery.data.data, null, 2),
      'application/json',
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Configuration tree</h1>
          <p className="text-sm text-slate-400">
            The entire VyOS running configuration, as an editable tree. Edits are queued below and
            only applied when you Commit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-surface-border bg-surface-900 p-1 text-xs">
            <button
              onClick={() => setView('tree')}
              className={`rounded px-3 py-1.5 font-medium ${view === 'tree' ? 'bg-accent-600 text-white' : 'text-slate-400'}`}
            >
              Tree
            </button>
            <button
              onClick={() => setView('commands')}
              className={`rounded px-3 py-1.5 font-medium ${view === 'commands' ? 'bg-accent-600 text-white' : 'text-slate-400'}`}
            >
              Set commands
            </button>
            <button
              onClick={() => setView('import')}
              className={`rounded px-3 py-1.5 font-medium ${view === 'import' ? 'bg-accent-600 text-white' : 'text-slate-400'}`}
            >
              Import
            </button>
          </div>
          {view === 'tree' && (
            <button
              onClick={downloadJson}
              disabled={!treeQuery.data}
              className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-surface-800 disabled:opacity-50"
            >
              Download JSON
            </button>
          )}
          {view === 'commands' && (
            <button
              onClick={downloadSetCommands}
              disabled={!commandsQuery.data}
              className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-surface-800 disabled:opacity-50"
            >
              Download
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        {view === 'tree' && (
          <>
            {treeQuery.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
            {treeQuery.isError && (
              <p className="text-sm text-danger-500">Failed to load configuration.</p>
            )}
            {treeQuery.data && (
              <TreeNode segment={null} path={[]} value={treeQuery.data.data} depth={0} />
            )}
          </>
        )}

        {view === 'commands' && (
          <>
            {commandsQuery.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
            {commandsQuery.isError && (
              <p className="text-sm text-danger-500">Failed to load set-commands.</p>
            )}
            {commandsQuery.data && (
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-300">
                {commandsQuery.data.text}
              </pre>
            )}
          </>
        )}

        {view === 'import' && <ImportConfigPanel />}
      </div>
    </div>
  )
}
