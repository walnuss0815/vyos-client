// Matches the confirmSeconds bounds enforced server-side in
// handleCommit/handleImportConfig (backend/internal/api/config_handlers.go).
export const MIN_CONFIRM_SECONDS = 10
export const MAX_CONFIRM_SECONDS = 600
export const DEFAULT_CONFIRM_SECONDS = 90

export function clampConfirmSeconds(seconds: number): number {
  return Math.min(MAX_CONFIRM_SECONDS, Math.max(MIN_CONFIRM_SECONDS, Math.round(seconds)))
}
