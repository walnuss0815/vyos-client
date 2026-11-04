import { useQuery } from '@tanstack/react-query'
import { clampConfirmSeconds, DEFAULT_CONFIRM_SECONDS } from '../lib/safeApply'
import { getSystemInfo } from '../lib/vyosApi'

/**
 * Shared `GET /api/system/info` query (hostname + VyOS version), used
 * by the Dashboard's Hostname/Version cards, Layout's sidebar/
 * document-title, and LoginPage's heading - same query key, so all
 * consumers share one cached request rather than firing it separately.
 * The backend endpoint is intentionally unauthenticated (unlike every
 * other data endpoint) specifically so LoginPage can use this hook
 * before a session exists - see
 * backend/internal/api/system_handlers.go's handleSystemInfo doc
 * comment.
 *
 * Deliberately not auto-refreshing: hostname/version can't change
 * without a commit and reboot, so polling this adds no value (unlike
 * useInterfaces/useRoutes, which reflect state that changes on its
 * own).
 */
export function useSystemInfo() {
  return useQuery({
    queryKey: ['system-info'],
    queryFn: getSystemInfo,
  })
}

/** Initial value for the "Safe apply" seconds inputs: the backend's
 * configured default, kept within the range the backend accepts. */
export function useDefaultConfirmSeconds(): number {
  const { data } = useSystemInfo()
  return clampConfirmSeconds(data?.safeApplyDefaultSeconds ?? DEFAULT_CONFIRM_SECONDS)
}
