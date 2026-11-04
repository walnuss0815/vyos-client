import { useState } from 'react'
import { MAX_CONFIRM_SECONDS, MIN_CONFIRM_SECONDS } from '../lib/safeApply'
import type { CommitResponse } from '../lib/vyosApi'
import { useConfirmCountdown } from './useConfirmCountdown'
import { useDefaultConfirmSeconds } from './useSystemInfo'

/**
 * State of a "Safe apply" toggle plus its seconds input. `valid` is
 * false when the toggle is on but the seconds are outside the
 * backend's accepted range: clearing the field gives Number('') === 0,
 * which vyosApi would otherwise silently send as "no confirm window",
 * so callers must block the action while it is false instead of
 * quietly dropping the safety net.
 */
export function useSafeApplyInput(initialEnabled: boolean) {
  const defaultSeconds = useDefaultConfirmSeconds()
  const [enabled, setEnabled] = useState(initialEnabled)
  // null until edited, so the backend default that arrives after mount still applies.
  const [edited, setSeconds] = useState<number | null>(null)
  const seconds = edited ?? defaultSeconds
  const valid = !enabled || (seconds >= MIN_CONFIRM_SECONDS && seconds <= MAX_CONFIRM_SECONDS)
  return { enabled, setEnabled, seconds, setSeconds, valid, defaultSeconds }
}

/**
 * An open commit-confirm window (started by a commit, import or
 * rollback - VyOS has one session-scoped timer for all of them) and
 * its countdown. `onExpire` runs when VyOS reverts on its own.
 */
export function useCommitConfirm(onExpire: () => void) {
  // endsAt is a Date.now() timestamp: when VyOS will auto-revert unless confirmed.
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const secondsLeft = useConfirmCountdown(endsAt, () => {
    setEndsAt(null)
    onExpire()
  })
  return {
    active: endsAt !== null,
    secondsLeft,
    // VyOS rounds the window up to whole minutes, so prefer what it reports.
    start: (response: CommitResponse, requestedSeconds: number) =>
      setEndsAt(Date.now() + (response.confirmSeconds ?? requestedSeconds) * 1000),
    stop: () => setEndsAt(null),
  }
}
