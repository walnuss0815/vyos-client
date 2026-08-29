import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import InterfacesTable from '../components/InterfacesTable'
import RefreshControl from '../components/RefreshControl'
import RoutesTable from '../components/RoutesTable'
import UsageChart from '../components/UsageChart'
import { useInterfaces } from '../hooks/useInterfaces'
import { useInterfaceThroughput } from '../hooks/useInterfaceThroughput'
import { useRoutes } from '../hooks/useRoutes'
import { DEFAULT_MAX_SAMPLES, useSampleHistory } from '../hooks/useSampleHistory'
import { useSystemInfo } from '../hooks/useSystemInfo'
import { useSystemResources } from '../hooks/useSystemResources'
import { formatBytes } from '../lib/formatBytes'
import { isPhysicalInterface, isVlanInterface } from '../lib/interfaceType'

/** How many rows the Dashboard's preview tables show before pointing
 * to the full page for the rest. */
const PREVIEW_ROW_LIMIT = 10

/** Dedicated poll cadence for the live CPU/memory/throughput charts -
 * deliberately faster and independent of the shared 15/30/60s
 * auto-refresh preference (store/refreshSettings.ts) used everywhere
 * else, since a usable trend line needs more than one point a minute.
 * Every poll at this cadence is still a real op-mode round-trip to the
 * router (see docs/architecture.md), so this isn't pushed any faster
 * than that - and can be turned off entirely via the toggle below.
 * `useSampleHistory`'s own `DEFAULT_MAX_SAMPLES` was raised in lockstep
 * with this (60->150) when this was sped up from 5s to keep the
 * visible history depth at 5 minutes rather than shrinking it. */
const LIVE_CHART_REFETCH_MS = 2000

/** Fixed time span every UsageChart on this page represents, in
 * lockstep with useSampleHistory/useInterfaceThroughput's own
 * DEFAULT_MAX_SAMPLES (150 samples * 2s poll = 5 minutes) - passed to
 * UsageChart so its x-axis stays a fixed 5-minute window regardless of
 * how many samples have accumulated so far, rather than rescaling on
 * every new one. */
const CHART_WINDOW_MS = DEFAULT_MAX_SAMPLES * LIVE_CHART_REFETCH_MS

/** Formats a percentage value (0-100) for chart hover tooltips - CPU
 * load and memory usage both use this. */
function formatPercent(v: number): string {
  return `${Math.round(v)}%`
}

export default function DashboardPage() {
  const [liveChartsEnabled, setLiveChartsEnabled] = useState(true)
  const [selectedInterfaceName, setSelectedInterfaceName] = useState<string | undefined>(undefined)
  const chartRefetchInterval = liveChartsEnabled ? LIVE_CHART_REFETCH_MS : false

  const systemInfoQuery = useSystemInfo()
  const resourcesQuery = useSystemResources(chartRefetchInterval)
  const interfacesQuery = useInterfaces(chartRefetchInterval)
  const routesQuery = useRoutes()

  // Unlike the full /interfaces page, the Dashboard's preview is
  // narrowed to physical + VLAN interfaces - virtual-only interfaces
  // (bridges, bonds, tunnels, ...) are more often noise than signal in
  // an at-a-glance overview. The throughput chart's interface picker
  // reuses this same narrowed set, for the same reason.
  const dashboardInterfaces = interfacesQuery.data?.filter(
    (iface) => isPhysicalInterface(iface.name) || isVlanInterface(iface.name),
  )
  const effectiveInterfaceName = selectedInterfaceName ?? dashboardInterfaces?.[0]?.name

  const hostnameValue = systemInfoQuery.isError
    ? 'Unable to load'
    : (systemInfoQuery.data?.hostname ?? '…')
  const versionValue = systemInfoQuery.isError
    ? 'Unable to load'
    : (systemInfoQuery.data?.version ?? '…')

  const resources = resourcesQuery.data
  const resourcesUnavailable = resourcesQuery.isError ? 'Unable to load' : undefined

  const uptimeValue = resourcesUnavailable ?? resources?.uptime.uptime ?? '…'
  const uptimeSubtext = resources
    ? `Load ${Math.round(resources.uptime.load1)}% / ${Math.round(resources.uptime.load5)}% / ${Math.round(resources.uptime.load15)}%`
    : undefined

  const cpuValue = resourcesUnavailable ?? (resources ? `${resources.cpu.cores} cores` : '…')
  const cpuSubtext = resources?.cpu.model
  const cpuHistory = useSampleHistory(resourcesQuery.dataUpdatedAt, resources?.uptime.load1)

  const memoryUsedPercent =
    resources && resources.memory.totalBytes > 0
      ? (resources.memory.usedBytes / resources.memory.totalBytes) * 100
      : undefined
  const memoryValue =
    resourcesUnavailable ??
    (resources ? `${formatBytes(resources.memory.usedBytes)} / ${formatBytes(resources.memory.totalBytes)}` : '…')
  const memorySubtext =
    memoryUsedPercent !== undefined ? `${Math.round(memoryUsedPercent)}% used` : undefined
  const memoryHistory = useSampleHistory(resourcesQuery.dataUpdatedAt, memoryUsedPercent)

  const throughputSamples = useInterfaceThroughput(
    interfacesQuery.data,
    interfacesQuery.dataUpdatedAt,
    effectiveInterfaceName,
  )
  const rxPoints = throughputSamples.map((s) => ({ t: s.t, v: s.rxBps }))
  const txPoints = throughputSamples.map((s) => ({ t: s.t, v: s.txBps }))
  const latestThroughput = throughputSamples.at(-1)

  const storageValue =
    resourcesUnavailable ??
    (resources
      ? resources.storage
        ? `${formatBytes(resources.storage.usedBytes)} / ${formatBytes(resources.storage.sizeBytes)}`
        : 'Unavailable'
      : '…')
  const storageSubtext =
    resources?.storage && resources.storage.sizeBytes > 0
      ? `${Math.round((resources.storage.usedBytes / resources.storage.sizeBytes) * 100)}% used`
      : undefined

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {systemInfoQuery.data?.loginBanner && (
        <LoginBanner text={systemInfoQuery.data.loginBanner} />
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 text-lg font-semibold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400">Overview of this VyOS instance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={liveChartsEnabled}
              onChange={(e) => setLiveChartsEnabled(e.target.checked)}
              className="accent-accent-500"
            />
            Live charts (2s)
          </label>
          <RefreshControl />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card label="Hostname" value={hostnameValue} muted={systemInfoQuery.isError} />
        <Card label="VyOS version" value={versionValue} muted={systemInfoQuery.isError} />
        <Card
          label="Uptime"
          value={uptimeValue}
          subtext={uptimeSubtext}
          muted={resourcesQuery.isError}
        />
        <Card
          label="Storage"
          value={storageValue}
          subtext={storageSubtext}
          muted={resourcesQuery.isError || (!!resources && !resources.storage)}
        />
      </div>

      <ResourceUsageSection
        cpuValue={cpuValue}
        cpuSubtext={cpuSubtext}
        cpuHistory={cpuHistory}
        memoryValue={memoryValue}
        memorySubtext={memorySubtext}
        memoryHistory={memoryHistory}
        isError={resourcesQuery.isError}
      />

      <ThroughputSection
        interfaces={dashboardInterfaces}
        selectedInterfaceName={effectiveInterfaceName}
        onSelectInterface={setSelectedInterfaceName}
        rxPoints={rxPoints}
        txPoints={txPoints}
        latestRxBps={latestThroughput?.rxBps}
        latestTxBps={latestThroughput?.txBps}
        isError={interfacesQuery.isError}
      />

      <PreviewSection
        title="Interfaces"
        totalCount={dashboardInterfaces?.length}
        viewAllHref="/interfaces"
      >
        {interfacesQuery.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
        {interfacesQuery.isError && (
          <p className="text-sm text-danger-500">Failed to load interfaces.</p>
        )}
        {dashboardInterfaces && (
          <InterfacesTable interfaces={dashboardInterfaces.slice(0, PREVIEW_ROW_LIMIT)} />
        )}
      </PreviewSection>

      {/* Unlike Interfaces above, these show every route, not just a
          preview slice - routing tables are usually short enough that
          a hard cutoff would hide routes someone's specifically
          looking for. The dedicated Routing page (linked below) still
          exists as a separate, dashboard-clutter-free full view. */}
      <PreviewSection title="IPv4 Routing" totalCount={routesQuery.data?.ipv4.length} viewAllHref="/routes">
        {routesQuery.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
        {routesQuery.isError && (
          <p className="text-sm text-danger-500">Failed to load routing information.</p>
        )}
        {routesQuery.data && <RoutesTable routes={routesQuery.data.ipv4} />}
      </PreviewSection>

      <PreviewSection title="IPv6 Routing" totalCount={routesQuery.data?.ipv6.length} viewAllHref="/routes">
        {routesQuery.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
        {routesQuery.isError && (
          <p className="text-sm text-danger-500">Failed to load routing information.</p>
        )}
        {routesQuery.data && <RoutesTable routes={routesQuery.data.ipv6} />}
      </PreviewSection>
    </div>
  )
}

/**
 * VyOS's own configured `system login banner` text, shown as the very
 * first thing on the Dashboard - not built on ConfigWarningsBanner
 * (that one is global-to-every-page, collapsible, and warning-toned;
 * this is Dashboard-only, always fully shown, and just informational,
 * not a warning). Rendered only when non-empty (see DashboardPage's
 * call site) - most routers won't have one configured.
 * whitespace-pre-wrap preserves line breaks, since these banners are
 * often multi-line (e.g. a legal/security notice).
 */
function LoginBanner({ text }: { text: string }) {
  return (
    <div className="mb-6 rounded-xl border border-surface-border bg-surface-900 p-4">
      <p className="whitespace-pre-wrap text-sm text-slate-300">{text}</p>
    </div>
  )
}

function Card({
  label,
  value,
  subtext,
  muted,
  chart,
}: {
  label: string
  value: string
  subtext?: string
  muted?: boolean
  /** An optional live-history sparkline (see UsageChart) rendered
   * below the subtext - only CPU and Memory pass one, since they're
   * the only cards with an always-present, bounded (0-100%) history
   * worth trending at a glance. */
  chart?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-medium ${muted ? 'text-slate-500' : 'text-white'}`}>
        {value}
      </p>
      {subtext && <p className="mt-0.5 truncate text-xs text-slate-500">{subtext}</p>}
      {chart && <div className="mt-2">{chart}</div>}
    </div>
  )
}

/** CPU and Memory, each with a live-history sparkline, in their own
 * dedicated section below the main info grid - separated out from
 * Hostname/VyOS version/Uptime/Storage (which have no comparable
 * always-present, bounded (0-100%) history worth trending) so the two
 * charted metrics get a section of their own, the same treatment
 * ThroughputSection already gets rather than being squeezed into the
 * same flat card grid as everything else. */
function ResourceUsageSection({
  cpuValue,
  cpuSubtext,
  cpuHistory,
  memoryValue,
  memorySubtext,
  memoryHistory,
  isError,
}: {
  cpuValue: string
  cpuSubtext: string | undefined
  cpuHistory: { t: number; v: number }[]
  memoryValue: string
  memorySubtext: string | undefined
  memoryHistory: { t: number; v: number }[]
  isError: boolean
}) {
  return (
    <section className="mt-4 rounded-xl border border-surface-border bg-surface-900 p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Resource usage</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card
          label="CPU"
          value={cpuValue}
          subtext={cpuSubtext}
          muted={isError}
          chart={
            <UsageChart
              series={[
                {
                  points: cpuHistory,
                  colorClassName: 'text-accent-500',
                  label: 'CPU load',
                  formatValue: formatPercent,
                },
              ]}
              max={100}
              windowMs={CHART_WINDOW_MS}
              ariaLabel="CPU load history"
            />
          }
        />
        <Card
          label="Memory"
          value={memoryValue}
          subtext={memorySubtext}
          muted={isError}
          chart={
            <UsageChart
              series={[
                {
                  points: memoryHistory,
                  colorClassName: 'text-accent-500',
                  label: 'Memory used',
                  formatValue: formatPercent,
                },
              ]}
              max={100}
              windowMs={CHART_WINDOW_MS}
              ariaLabel="Memory usage history"
            />
          }
        />
      </div>
    </section>
  )
}

/** Formats a bytes/sec rate using the same 1024-based, VyOS-style
 * convention as formatBytes (memory/storage cards) - just with a
 * "/s" suffix, so 1500 -> "1.46 KB/s" rather than a raw byte count. */
function formatThroughput(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`
}

/** Live rx/tx throughput for one selected interface - a dropdown to
 * pick which of the Dashboard's (physical/VLAN) interfaces to chart,
 * plus a two-line UsageChart (download vs. upload) and the latest
 * instantaneous rate for each direction. Unlike the CPU/Memory cards
 * above, this has no natural fixed ceiling (depends entirely on link
 * speed and actual traffic), so its chart auto-scales instead of
 * passing a `max`. */
function ThroughputSection({
  interfaces,
  selectedInterfaceName,
  onSelectInterface,
  rxPoints,
  txPoints,
  latestRxBps,
  latestTxBps,
  isError,
}: {
  interfaces: { name: string }[] | undefined
  selectedInterfaceName: string | undefined
  onSelectInterface: (name: string) => void
  rxPoints: { t: number; v: number }[]
  txPoints: { t: number; v: number }[]
  latestRxBps: number | undefined
  latestTxBps: number | undefined
  isError: boolean
}) {
  return (
    <section className="mt-4 rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">Throughput</p>
        {interfaces && interfaces.length > 0 && (
          <select
            aria-label="Throughput interface"
            value={selectedInterfaceName ?? ''}
            onChange={(e) => onSelectInterface(e.target.value)}
            className="rounded border border-surface-border bg-surface-800 px-1.5 py-0.5 text-xs text-white outline-none focus:border-accent-500"
          >
            {interfaces.map((iface) => (
              <option key={iface.name} value={iface.name}>
                {iface.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {isError && <p className="text-sm text-danger-500">Failed to load interfaces.</p>}
      {!isError && (!interfaces || interfaces.length === 0) && (
        <p className="text-sm text-slate-400">No interfaces available yet.</p>
      )}
      {!isError && interfaces && interfaces.length > 0 && (
        <>
          <UsageChart
            series={[
              { points: rxPoints, colorClassName: 'text-accent-500', label: 'Download', formatValue: formatThroughput },
              { points: txPoints, colorClassName: 'text-slate-400', label: 'Upload', formatValue: formatThroughput },
            ]}
            windowMs={CHART_WINDOW_MS}
            ariaLabel={`${selectedInterfaceName ?? 'interface'} throughput history`}
          />
          <div className="mt-2 flex gap-6 text-xs">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="h-2 w-2 rounded-full bg-accent-500" aria-hidden="true" />
              Download: {latestRxBps !== undefined ? formatThroughput(latestRxBps) : '…'}
            </span>
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
              Upload: {latestTxBps !== undefined ? formatThroughput(latestTxBps) : '…'}
            </span>
          </div>
        </>
      )}
    </section>
  )
}

/** A titled section with a count and a link to the corresponding full
 * page. Reused for Interfaces (a preview slice) and Routes (the full
 * list) below - "totalCount" always reflects what's actually rendered
 * inside, whether or not that's the complete data set. */
function PreviewSection({
  title,
  totalCount,
  viewAllHref,
  children,
}: {
  title: string
  totalCount: number | undefined
  viewAllHref: string
  children: ReactNode
}) {
  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          {title}
          {totalCount !== undefined && <span className="ml-2 text-slate-600">({totalCount})</span>}
        </h2>
        <Link to={viewAllHref} className="text-xs text-accent-500 hover:text-accent-400">
          View all →
        </Link>
      </div>
      {children}
    </section>
  )
}
