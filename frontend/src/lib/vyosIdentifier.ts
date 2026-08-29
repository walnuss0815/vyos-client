/**
 * VyOS node identifiers (zone names, group names, custom firewall
 * ruleset names, and similar) are restricted to alphanumeric
 * characters, hyphens, and underscores, and can't start with a hyphen
 * or underscore. This isn't validated client-side by every form that
 * creates one of these - checking here gives a fail-fast UX instead of
 * only discovering a bad name (e.g. one with spaces) after a
 * round-trip to VyOS's own commit-time validation, surfaced as an
 * opaque 422 error.
 */
export const VYOS_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

export function isValidVyOSIdentifier(name: string): boolean {
  return VYOS_IDENTIFIER_PATTERN.test(name)
}
