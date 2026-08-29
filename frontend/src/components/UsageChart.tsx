import { useRef, useState } from 'react'
import type { Sample } from '../hooks/useSampleHistory'

/** Fixed SVG coordinate system the chart is drawn in, then scaled to
 * fit its container via `width="100%"` + `preserveAspectRatio="none"` -
 * these are arbitrary units, not pixels, so any element's rendered
 * size is whatever its container's CSS gives it. */
const VIEW_WIDTH = 100
const VIEW_HEIGHT = 32

export interface ChartSeries {
  points: Sample[]
  /** A Tailwind text-color utility (e.g. `text-accent-500`) - the SVG
   * paths use `stroke="currentColor"`/`fill="currentColor"`, the same
   * "inherit color from a wrapping text class" convention this app's
   * other hand-rolled SVGs use (see ThemeToggle.tsx), rather than a
   * literal color prop. */
  colorClassName: string
  /** Shown in the hover tooltip next to this series' value, e.g.
   * "CPU load" or "Download". */
  label: string
  /** Formats one raw value for the hover tooltip, e.g. `(v) =>
   * `${Math.round(v)}%`` or an existing bytes/sec formatter. */
  formatValue: (v: number) => string
}

export interface UsageChartProps {
  series: ChartSeries[]
  /** Fixed y-axis upper bound (e.g. 100 for a percentage series) - use
   * this whenever the metric has a natural, meaningful ceiling, so the
   * chart doesn't misleadingly auto-zoom into a narrow band (a load
   * hovering between 40-45% would otherwise look like it's swinging
   * wildly). Omit for metrics with no natural ceiling (e.g.
   * throughput, which auto-scales to the highest value currently in
   * the window instead). */
  max?: number
  /** Fixed time span (milliseconds) the x-axis always represents, e.g.
   * 5 minutes. The newest point is always pinned to the chart's right
   * edge, and a point exactly `windowMs` older sits at the left edge -
   * so already-drawn points never shift or rescale as new samples
   * arrive (only the right edge advances, and points older than the
   * window drop off the left), unlike naive index-based spacing which
   * would rescale/compress every existing point on every new sample. */
  windowMs: number
  /** Accessible label for the chart as a whole (e.g. "CPU load over
   * the last 5 minutes") - the SVG itself is `aria-hidden`, decorative
   * markup only. */
  ariaLabel: string
  /** Shown in place of the chart while there are fewer than 2 points
   * to draw a line between. */
  emptyLabel?: string
}

interface PlottedPoint {
  t: number
  v: number
  /** Position in VIEW_WIDTH/VIEW_HEIGHT viewBox units. */
  x: number
  y: number
}

interface PlottedSeries extends Omit<ChartSeries, 'points'> {
  points: PlottedPoint[]
}

/**
 * A minimal hand-rolled SVG line/area sparkline, with a Grafana-style
 * hover tooltip, for live numeric history (CPU load, memory usage,
 * interface throughput) - see useSampleHistory/useInterfaceThroughput
 * for how the point arrays this renders are accumulated. Deliberately
 * not a charting library: this app has none as a dependency, and this
 * is well within what a few dozen lines of SVG plus a bit of pointer
 * tracking can do without one - the same reasoning behind this app's
 * other hand-rolled SVG components (ThemeToggle, InfoTooltip) instead
 * of an icon library.
 *
 * Points are placed by their actual timestamp within a fixed
 * `windowMs`-wide span (see that prop's doc comment), not by array
 * index - deliberately so the chart doesn't rescale/compress its
 * existing history every time a new sample arrives.
 */
export default function UsageChart({
  series,
  max,
  windowMs,
  ariaLabel,
  emptyLabel = 'Collecting data…',
}: UsageChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)

  const allPoints = series.flatMap((s) => s.points)
  if (allPoints.length < 2) {
    return (
      <div className="flex h-24 items-center justify-center text-xs text-slate-500">{emptyLabel}</div>
    )
  }

  const latestT = Math.max(...allPoints.map((p) => p.t))
  const values = allPoints.map((p) => p.v)
  const dataMax = Math.max(...values)
  // A fixed `max` still gets clamped upward if the data somehow
  // exceeds it (e.g. a load spike briefly over 100%, which VyOS's own
  // per-core normalization can produce under heavy contention) rather
  // than clipping the line off the top of the chart.
  const yMax = Math.max(max ?? dataMax, dataMax, 1)
  const yMin = 0

  const toX = (t: number) => VIEW_WIDTH * (1 - (latestT - t) / windowMs)
  const toY = (v: number) => {
    const clamped = Math.min(Math.max(v, yMin), yMax)
    return VIEW_HEIGHT - ((clamped - yMin) / (yMax - yMin)) * VIEW_HEIGHT
  }

  const plotted: PlottedSeries[] = series.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ t: p.t, v: p.v, x: toX(p.t), y: toY(p.v) })),
  }))

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const fraction = (e.clientX - rect.left) / rect.width
    setHoverX(Math.min(Math.max(fraction, 0), 1) * VIEW_WIDTH)
  }

  const hoverEntries =
    hoverX === null
      ? null
      : plotted
          .filter((s) => s.points.length > 0)
          .map((s) => ({
            label: s.label,
            colorClassName: s.colorClassName,
            point: s.points[nearestIndexByX(s.points, hoverX)],
            formatValue: s.formatValue,
          }))

  // All series in practice share the same timestamps per sample (they
  // come from the same accumulator tick), so any one of them gives the
  // crosshair's true x position/time - the first is as good as any.
  const crosshair = hoverEntries?.[0]?.point

  return (
    <div
      ref={containerRef}
      className="relative h-24 w-full"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverX(null)}
    >
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label={ariaLabel}
      >
        {plotted.map((s, i) => (
          <ChartLine key={i} points={s.points} colorClassName={s.colorClassName} />
        ))}
        {crosshair && (
          <line
            x1={crosshair.x}
            x2={crosshair.x}
            y1={0}
            y2={VIEW_HEIGHT}
            stroke="currentColor"
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
            className="text-slate-500"
          />
        )}
      </svg>

      {/* Hover dots are plain HTML, not SVG circles: this chart's
          preserveAspectRatio="none" stretches x and y independently,
          which would turn an SVG <circle> into a visible ellipse - an
          HTML element positioned by CSS percentages renders as a true
          circle regardless of the container's aspect ratio. */}
      {hoverEntries?.map((entry, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${entry.colorClassName}`}
          style={{
            left: `${(entry.point.x / VIEW_WIDTH) * 100}%`,
            top: `${(entry.point.y / VIEW_HEIGHT) * 100}%`,
            backgroundColor: 'currentColor',
          }}
        />
      ))}

      {hoverEntries && hoverEntries.length > 0 && (
        <ChartTooltip entries={hoverEntries} xPercent={(hoverEntries[0].point.x / VIEW_WIDTH) * 100} />
      )}
    </div>
  )
}

function nearestIndexByX(points: PlottedPoint[], targetX: number): number {
  let nearestIndex = 0
  let nearestDistance = Infinity
  for (let i = 0; i < points.length; i++) {
    const distance = Math.abs(points[i].x - targetX)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = i
    }
  }
  return nearestIndex
}

function ChartLine({ points, colorClassName }: { points: PlottedPoint[]; colorClassName: string }) {
  if (points.length < 2) return null

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${VIEW_HEIGHT} L ${points[0].x} ${VIEW_HEIGHT} Z`

  return (
    <g className={colorClassName}>
      <path d={areaPath} fill="currentColor" opacity={0.12} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  )
}

/** Floating value box shown at the hovered point - clamped away from
 * the container's left/right edges so it doesn't overflow, since
 * there's no library layout engine here to measure and reposition it
 * automatically. */
function ChartTooltip({
  entries,
  xPercent,
}: {
  entries: { label: string; colorClassName: string; point: PlottedPoint; formatValue: (v: number) => string }[]
  xPercent: number
}) {
  const clampedLeftPercent = Math.min(Math.max(xPercent, 15), 85)
  const time = new Date(entries[0].point.t).toLocaleTimeString()

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-surface-border bg-surface-800 px-2.5 py-1.5 text-xs text-slate-200 shadow-lg"
      style={{ left: `${clampedLeftPercent}%` }}
    >
      <p className="mb-1 text-slate-400">{time}</p>
      {entries.map((entry, i) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${entry.colorClassName}`} style={{ backgroundColor: 'currentColor' }} />
          {entry.label}: {entry.formatValue(entry.point.v)}
        </p>
      ))}
    </div>
  )
}
