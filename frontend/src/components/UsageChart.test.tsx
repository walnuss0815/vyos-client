import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import UsageChart from './UsageChart'

const formatPercent = (v: number) => `${v}%`

describe('UsageChart', () => {
  it('shows a placeholder instead of a chart when there are fewer than 2 points', () => {
    render(
      <UsageChart
        series={[{ points: [{ t: 1, v: 5 }], colorClassName: 'text-accent-500', label: 'CPU', formatValue: formatPercent }]}
        windowMs={10000}
        ariaLabel="CPU load"
      />,
    )
    expect(screen.getByText('Collecting data…')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('supports a custom empty-state label', () => {
    render(
      <UsageChart
        series={[{ points: [], colorClassName: 'text-accent-500', label: 'CPU', formatValue: formatPercent }]}
        windowMs={10000}
        ariaLabel="CPU load"
        emptyLabel="No samples yet"
      />,
    )
    expect(screen.getByText('No samples yet')).toBeInTheDocument()
  })

  it('renders an accessible chart once there are 2+ points', () => {
    render(
      <UsageChart
        series={[
          {
            points: [
              { t: 1000, v: 10 },
              { t: 2000, v: 20 },
              { t: 3000, v: 15 },
            ],
            colorClassName: 'text-accent-500',
            label: 'CPU',
            formatValue: formatPercent,
          },
        ]}
        windowMs={10000}
        ariaLabel="CPU load over the last 5 minutes"
      />,
    )
    expect(screen.getByRole('img', { name: 'CPU load over the last 5 minutes' })).toBeInTheDocument()
    expect(screen.queryByText('Collecting data…')).not.toBeInTheDocument()
  })

  it('renders one line per series (e.g. rx/tx for throughput)', () => {
    const { container } = render(
      <UsageChart
        series={[
          {
            points: [
              { t: 1000, v: 10 },
              { t: 2000, v: 20 },
            ],
            colorClassName: 'text-accent-500',
            label: 'Download',
            formatValue: formatPercent,
          },
          {
            points: [
              { t: 1000, v: 5 },
              { t: 2000, v: 8 },
            ],
            colorClassName: 'text-slate-400',
            label: 'Upload',
            formatValue: formatPercent,
          },
        ]}
        windowMs={10000}
        ariaLabel="Throughput"
      />,
    )
    // One <g> wrapper per series, each containing an area path + a line path.
    expect(container.querySelectorAll('g')).toHaveLength(2)
    expect(container.querySelectorAll('path')).toHaveLength(4)
  })

  it('does not throw when a fixed max is smaller than the actual data (clamps upward instead)', () => {
    render(
      <UsageChart
        series={[
          {
            points: [
              { t: 1000, v: 90 },
              { t: 2000, v: 130 },
            ],
            colorClassName: 'text-accent-500',
            label: 'CPU',
            formatValue: formatPercent,
          },
        ]}
        max={100}
        windowMs={10000}
        ariaLabel="CPU load"
      />,
    )
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('does not throw when every value is identical (flat line, avoids a zero-range division)', () => {
    render(
      <UsageChart
        series={[
          {
            points: [
              { t: 1000, v: 0 },
              { t: 2000, v: 0 },
            ],
            colorClassName: 'text-accent-500',
            label: 'CPU',
            formatValue: formatPercent,
          },
        ]}
        windowMs={10000}
        ariaLabel="Idle interface"
      />,
    )
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  describe('fixed time-based x-axis', () => {
    /** Extracts the numeric x-coordinates from a line path's "M x y L
     * x y L x y ..." `d` attribute. */
    function xCoordsFromPath(container: HTMLElement): number[] {
      const linePath = container.querySelector('path[stroke="currentColor"]')
      const d = linePath?.getAttribute('d') ?? ''
      const matches = [...d.matchAll(/[ML] ([\d.-]+) [\d.-]+/g)]
      return matches.map((m) => Number(m[1]))
    }

    it('places points at exact, computable x-positions based on elapsed time, not array index', () => {
      // windowMs=4000, latestT=3000: ages are 2000/1000/0ms -> x = 100*(1-age/4000).
      const { container } = render(
        <UsageChart
          series={[
            {
              points: [
                { t: 1000, v: 0 },
                { t: 2000, v: 0 },
                { t: 3000, v: 0 },
              ],
              colorClassName: 'text-accent-500',
              label: 'CPU',
              formatValue: formatPercent,
            },
          ]}
          windowMs={4000}
          ariaLabel="CPU load"
        />,
      )
      expect(xCoordsFromPath(container)).toEqual([50, 75, 100])
    })

    it('shifts every existing point by exactly the same amount when one more sample is appended, rather than rescaling non-uniformly', () => {
      const seriesAt = (points: { t: number; v: number }[]) => [
        { points, colorClassName: 'text-accent-500', label: 'CPU', formatValue: formatPercent },
      ]
      const before = render(
        <UsageChart
          series={seriesAt([
            { t: 1000, v: 0 },
            { t: 2000, v: 0 },
            { t: 3000, v: 0 },
          ])}
          windowMs={4000}
          ariaLabel="CPU load"
        />,
      )
      const xBefore = xCoordsFromPath(before.container)

      // One more sample arrives, 1000ms later.
      const after = render(
        <UsageChart
          series={seriesAt([
            { t: 1000, v: 0 },
            { t: 2000, v: 0 },
            { t: 3000, v: 0 },
            { t: 4000, v: 0 },
          ])}
          windowMs={4000}
          ariaLabel="CPU load"
        />,
      )
      const xAfter = xCoordsFromPath(after.container)

      // The 3 pre-existing points are still the first 3 in the new
      // render - each must have shifted left by the exact same
      // distance (25 units, i.e. 100 * 1000ms/4000ms), not by a
      // different amount depending on the point's original index (the
      // bug this fixes: naive index-based spacing rescales/compresses
      // every point by a changing ratio whenever the total count
      // changes).
      const shifts = xBefore.map((x, i) => x - xAfter[i])
      expect(shifts).toEqual([25, 25, 25])
    })
  })

  describe('hover tooltip', () => {
    function renderWithRect(width = 100) {
      const rendered = render(
        <UsageChart
          series={[
            {
              points: [
                { t: 1000, v: 10 },
                { t: 2000, v: 20 },
                { t: 3000, v: 30 },
              ],
              colorClassName: 'text-accent-500',
              label: 'CPU load',
              formatValue: (v) => `${v}%`,
            },
          ]}
          windowMs={2000}
          ariaLabel="CPU load"
        />,
      )
      const wrapper = rendered.container.firstElementChild as HTMLElement
      vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        width,
        top: 0,
        height: 96,
        right: width,
        bottom: 96,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })
      return { ...rendered, wrapper }
    }

    it('shows nothing before the pointer has hovered', () => {
      renderWithRect()
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })

    it('shows a tooltip for the point nearest the pointer, with its label/value/time', () => {
      const { wrapper } = renderWithRect(100)
      // Pointer at the far right edge -> nearest the newest point (t=3000, v=30).
      fireEvent.pointerMove(wrapper, { clientX: 100 })

      const tooltip = screen.getByRole('tooltip')
      expect(tooltip).toHaveTextContent('CPU load: 30%')
    })

    it('shows the crosshair line while hovering', () => {
      const { wrapper, container } = renderWithRect(100)
      fireEvent.pointerMove(wrapper, { clientX: 100 })
      expect(container.querySelector('line')).not.toBeNull()
    })

    it('hides the tooltip and crosshair on pointer leave', () => {
      const { wrapper, container } = renderWithRect(100)
      fireEvent.pointerMove(wrapper, { clientX: 100 })
      expect(screen.getByRole('tooltip')).toBeInTheDocument()

      fireEvent.pointerLeave(wrapper)
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      expect(container.querySelector('line')).toBeNull()
    })

    it('snaps to the nearest point, not just the exact pointer position', () => {
      const { wrapper } = renderWithRect(100)
      // Points at t=1000/2000/3000 map to x=0/50/100 with windowMs=2000
      // and latestT=3000. Hovering at 60% should snap to the middle
      // point (x=50, v=20), not the nearest edge.
      fireEvent.pointerMove(wrapper, { clientX: 60 })
      expect(screen.getByRole('tooltip')).toHaveTextContent('CPU load: 20%')
    })
  })
})
