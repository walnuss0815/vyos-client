const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * Formats a plain byte count as a human-readable string (1024-based,
 * matching VyOS's own convention - see backend `parseHumanBytes`'s
 * doc comment) for the Dashboard's memory/storage cards. Whole bytes
 * are shown with no decimal places; anything scaled up to KB or
 * larger gets 2.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024
    unitIndex++
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${UNITS[unitIndex]}`
}
