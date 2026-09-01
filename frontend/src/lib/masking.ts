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

const sensitiveKeyPatterns = sensitiveFields.sensitiveKeyPatterns.map((pattern) => normalize(pattern))

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

/** Mirrors mask.IsSensitiveIdentifier in the Go backend - see that
 * function's own doc comment (and shared/sensitive-fields.json's
 * sensitiveKeyPatternsComment) for the full rationale: a
 * case-insensitive *substring* match against a tag-node's own
 * free-form identifier (e.g. a container environment variable's key,
 * "DB_PASSWORD"), deliberately different from isSensitiveLeaf's exact
 * match against fixed VyOS schema leaf names. */
export function isSensitiveIdentifier(name: string): boolean {
  const normalized = normalize(name)
  return sensitiveKeyPatterns.some((pattern) => normalized.includes(pattern))
}

/** Mirrors mask.IsMaskedPath in the Go backend - see that function's
 * own doc comment for the full rationale. Broader than
 * isSensitivePath: also catches the generic "value" leaf of a
 * tag-node collection (container/event-handler environment
 * variables, labels, sysctl parameters, ...) whose own identifier -
 * the second-to-last path segment - looks sensitive. */
export function isMaskedPath(path: string[]): boolean {
  if (isSensitivePath(path)) return true
  if (path.length < 2 || path[path.length - 1] !== 'value') return false
  return isSensitiveIdentifier(path[path.length - 2])
}

/** Returns value unchanged if path isn't masked, or the mask
 * placeholder if it is (see isMaskedPath). Mirrors mask.Value in the
 * Go backend. */
export function maskValue(path: string[], value: string): string {
  return isMaskedPath(path) ? MASK_PLACEHOLDER : value
}
