import { useEffect, useRef, useState } from 'react'

/**
 * Counts down to `endsAt` (a `Date.now()` timestamp, or null when no
 * commit-confirm window is open), returning the whole seconds left and
 * calling `onExpire` once when it runs out.
 *
 * Compares against the wall clock on every tick instead of
 * decrementing a counter, so a throttled background tab (browsers
 * slow timers down to about once a minute) still expires on time.
 * VyOS reverts on its own when the window ends, so without this the
 * UI would keep offering "Keep changes" for a configuration that is
 * already gone.
 */
export function useConfirmCountdown(endsAt: number | null, onExpire: () => void): number {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const onExpireRef = useRef(onExpire)
  useEffect(() => {
    onExpireRef.current = onExpire
  })

  useEffect(() => {
    if (endsAt === null) return
    const tick = () => {
      const left = Math.ceil((endsAt - Date.now()) / 1000)
      if (left <= 0) {
        clearInterval(id)
        onExpireRef.current()
        return
      }
      setSecondsLeft(left)
    }
    const id = setInterval(tick, 1000)
    tick()
    return () => clearInterval(id)
  }, [endsAt])

  return secondsLeft
}
