import { useState, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { useQueryClient } from '@tanstack/react-query'
import { useSelfUpgrade } from '../../hooks/useSelfUpgrade'
import { containerNamePath } from '../../lib/containerParse'
import { buttonClass } from '../../lib/formStyles'
import { pullContainerImage } from '../../lib/vyosApi'
import { usePendingChangesStore } from '../../store/pendingChanges'

const codeClass = 'rounded bg-surface-800 px-1 py-0.5 font-mono text-xs text-slate-300'

/** Per-element styling for release notes' rendered Markdown, since
 * this app doesn't pull in the Tailwind Typography plugin (`prose`
 * classes) just for this one use - react-markdown's `components` prop
 * lets each element get a plain Tailwind className directly instead,
 * matching the app's existing dark theme. Only the handful of
 * elements semantic-release's own release-notes-generator actually
 * produces (headings, paragraphs, lists, links, inline/block code)
 * need an entry here. */
const markdownComponents = {
  h1: (props: ComponentPropsWithoutRef<'h1'>) => <h3 className="mt-4 mb-2 text-sm font-semibold text-white first:mt-0" {...props} />,
  h2: (props: ComponentPropsWithoutRef<'h2'>) => <h3 className="mt-4 mb-2 text-sm font-semibold text-white first:mt-0" {...props} />,
  h3: (props: ComponentPropsWithoutRef<'h3'>) => <h4 className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 first:mt-0" {...props} />,
  p: (props: ComponentPropsWithoutRef<'p'>) => <p className="mb-2 text-sm text-slate-300 last:mb-0" {...props} />,
  ul: (props: ComponentPropsWithoutRef<'ul'>) => <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-slate-300 last:mb-0" {...props} />,
  ol: (props: ComponentPropsWithoutRef<'ol'>) => <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm text-slate-300 last:mb-0" {...props} />,
  li: (props: ComponentPropsWithoutRef<'li'>) => <li {...props} />,
  a: (props: ComponentPropsWithoutRef<'a'>) => (
    <a target="_blank" rel="noreferrer" className="text-accent-500 hover:text-accent-400" {...props} />
  ),
  code: (props: ComponentPropsWithoutRef<'code'>) => <code className="rounded bg-surface-800 px-1 py-0.5 font-mono text-xs text-slate-300" {...props} />,
  pre: (props: ComponentPropsWithoutRef<'pre'>) => (
    <pre className="mb-2 overflow-x-auto rounded bg-surface-800 p-2 font-mono text-xs text-slate-300 last:mb-0" {...props} />
  ),
  strong: (props: ComponentPropsWithoutRef<'strong'>) => <strong className="font-semibold text-white" {...props} />,
}

/** System > Upgrades - checks this app's own GitHub releases for an
 * update and, on request, pulls the new container image and queues
 * the `set container name <NAME> image <ref>` config change (see
 * docs/architecture.md's "Self-upgrade" section). Entirely disabled
 * by default (SELF_UPGRADE_ENABLED) - this page always renders (the
 * System tab bar always links here, per SystemLayout.tsx), showing an
 * explanatory disabled state rather than being hidden outright, so a
 * curious operator can discover how to turn it on without digging
 * through docs first.
 *
 * Deliberately does NOT auto-commit: pulling the image and queuing
 * the config op both happen on "Upgrade", but applying that change
 * still goes through the normal PendingChangesBar review/commit flow
 * (Safe apply available there, same as any other change) - consistent
 * with every other "create/edit" flow in this app, and lets the
 * operator review before a change that recreates this very container
 * takes effect. */
export default function UpgradesPage() {
  const query = useSelfUpgrade()
  const queryClient = useQueryClient()
  const add = usePendingChangesStore((s) => s.add)

  const [pullingVersion, setPullingVersion] = useState<string | null>(null)
  const [pullError, setPullError] = useState<string | null>(null)
  const [queuedVersion, setQueuedVersion] = useState<string | null>(null)

  if (query.isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (query.isError || !query.data) {
    return <p className="text-sm text-danger-500">Failed to check for updates.</p>
  }

  const status = query.data

  if (!status.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-2 text-sm font-medium text-white">Self-upgrade is disabled</p>
        <p className="text-sm text-slate-400">
          Set <code className={codeClass}>SELF_UPGRADE_ENABLED=true</code> and{' '}
          <code className={codeClass}>SELF_UPGRADE_CONTAINER_NAME</code> (matching the name used in
          this deployment&apos;s own <code className={codeClass}>set container name &lt;NAME&gt; image ...</code>{' '}
          on VyOS) to turn this page on - see the configuration reference docs for details. Disabled
          by default since it makes this backend call an external service (the GitHub Releases API)
          for the first and only time anywhere in this app.
        </p>
      </div>
    )
  }

  async function handleUpgrade(version: string) {
    if (!status.enabled) return
    const imageRef = `${status.imageRepo}:${version}`
    setPullingVersion(version)
    setPullError(null)
    setQueuedVersion(null)
    try {
      await pullContainerImage(imageRef)
      const path = containerNamePath(status.containerName, 'image')
      add({ op: { op: 'set', path, value: imageRef }, label: `set ${path.join(' ')} '${imageRef}'` })
      setQueuedVersion(version)
    } catch (err) {
      setPullError(err instanceof Error ? err.message : 'Failed to pull the new image.')
    } finally {
      setPullingVersion(null)
    }
  }

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['self-upgrade'] })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current version</p>
            <p className="mt-1 font-mono text-lg text-white">{status.currentVersion || 'unknown'}</p>
            {status.latestVersion && (
              <p className="mt-1 text-xs text-slate-500">
                Latest published release: <span className="font-mono">{status.latestVersion}</span>
              </p>
            )}
          </div>
          <button onClick={refresh} className={`bg-surface-800 ${buttonClass}`}>
            Refresh
          </button>
        </div>
        {!status.currentVersionRecognized && (
          <p className="mt-3 text-xs text-slate-500">
            This build&apos;s version (<span className="font-mono">{status.currentVersion || 'dev'}</span>) isn&apos;t a
            recognized release version, so it can&apos;t be compared against what&apos;s published on GitHub.
          </p>
        )}
      </div>

      {status.currentVersionRecognized && !status.updateAvailable && (
        <p className="text-sm text-slate-400">You&apos;re running the latest published release.</p>
      )}

      {status.updateAvailable && (
        <div className="rounded-xl border border-warning-500/40 bg-warning-500/10 p-3">
          <p className="text-sm text-warning-500">
            {status.releases.length} update{status.releases.length === 1 ? '' : 's'} available - review what&apos;s
            changed below before upgrading.
          </p>
        </div>
      )}

      {pullError && <p className="text-sm text-danger-500">{pullError}</p>}
      {queuedVersion && !pullError && (
        <p className="text-sm text-success-500">
          Pulled and queued image <span className="font-mono">{status.imageRepo}:{queuedVersion}</span> - review and
          commit below (with Safe apply strongly recommended: this change recreates this very
          container, and Safe apply automatically reverts if the new image doesn&apos;t come back up).
        </p>
      )}

      <div className="space-y-3">
        {status.releases.map((release) => (
          <div key={release.version} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="font-mono text-sm font-medium text-white">{release.name || release.version}</span>
                {release.publishedAt && (
                  <span className="ml-2 text-xs text-slate-500">
                    {new Date(release.publishedAt).toLocaleDateString()}
                  </span>
                )}
                {release.htmlUrl && (
                  <a
                    href={release.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 text-xs text-accent-500 hover:text-accent-400"
                  >
                    View on GitHub
                  </a>
                )}
              </div>
              <button
                onClick={() => void handleUpgrade(release.version)}
                disabled={pullingVersion !== null}
                className={`bg-accent-600 ${buttonClass}`}
              >
                {pullingVersion === release.version ? 'Pulling…' : `Upgrade to ${release.version}`}
              </button>
            </div>
            {pullingVersion === release.version && (
              <p className="mt-2 text-xs text-slate-500">
                Pulling can take several minutes for a large image, with no progress shown until it
                finishes - this isn&apos;t stuck.
              </p>
            )}
            {release.body && (
              <div className="mt-3 border-t border-surface-border pt-3">
                <ReactMarkdown components={markdownComponents}>{release.body}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
