/**
 * Sensitive-leaf masking, mirroring backend/internal/mask exactly. Both
 * sides read the same source of truth: /shared/sensitive-fields.json.
 * See that file's $comment for the matching rules.
 */
import sensitiveFields from '@shared/sensitive-fields.json'

export const MASK_PLACEHOLDER = '••••••••'

const sensitiveLeafNames = new Set(
  sensitiveFields.sensitiveLeafNames.map((name) => normalize(name)),
)

function normalize(name: string): string {
  return name.toLowerCase().replaceAll('_', '-')
}

export function isSensitiveLeaf(leafName: string): boolean {
  return sensitiveLeafNames.has(normalize(leafName))
}

export function isSensitivePath(path: string[]): boolean {
  if (path.length === 0) return false
  return isSensitiveLeaf(path[path.length - 1])
}

/** Returns value unchanged if path isn't sensitive, or the mask
 * placeholder if it is. Mirrors mask.Value in the Go backend. */
export function maskValue(path: string[], value: string): string {
  return isSensitivePath(path) ? MASK_PLACEHOLDER : value
}
