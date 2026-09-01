import { search } from 'jmespath'
import rulesData from './configWarningRules.json'

/**
 * Data-driven rules for the config-warnings banner - see
 * configWarningRules.schema.json for the full shape/rationale and
 * configWarningRules.json for the actual rules. This module loads that
 * data (already schema-validated - see below) and evaluates each
 * rule's JMESPath query (evaluateConfigWarningRules) against the facts
 * object lib/configWarnings.ts builds from already-typed config.
 *
 * Schema validation against configWarningRules.schema.json happens in
 * configWarningRules.test.ts, not here at runtime. It used to run here
 * too (via ajv), but ajv's default compile() calls `new Function()` to
 * turn a schema into an executable validator - which a strict
 * Content-Security-Policy's `script-src` (no `'unsafe-eval'`) blocks
 * outright in every real browser (see
 * backend/internal/api/security_headers.go). Since this module sits on
 * every page's import graph (there's no route-level code splitting -
 * App.tsx statically imports every page, including Layout, which
 * always renders ConfigWarningsBanner regardless of whether that
 * banner is enabled), that thrown error crashed the whole app before
 * React ever mounted - not caught by ErrorBoundary, since the crash
 * happened during module evaluation, before any component rendered.
 * configWarningRules.json is a static, developer-authored file with no
 * runtime-varying input, so re-validating it inside every user's
 * browser on every page load was never actually necessary - the
 * existing test already provides the same "fail loud at build/test
 * time" safety net the doc comment below originally described, just
 * confined to Node/Vitest execution where no CSP applies.
 *
 * Every rule's query MUST evaluate to an array - one warning is
 * produced per array element, with that element's own fields
 * available for `{fieldName}` interpolation in the rule's `id`/
 * `message` templates. This uniform "always an array" model is why
 * even single-object conditions (e.g. SSH password auth, a check
 * against one `ssh` object, not a list) are written as
 * `[ssh][?...]` - a one-element JMESPath "multiselect list" wrapping
 * the single object, filtered the same way an array of many would be.
 */
export interface ConfigWarningRule {
  id: string
  query: string
  message: string
  description?: string
}

export interface ConfigWarning {
  id: string
  message: string
}

// Schema-validated by configWarningRules.test.ts, not at runtime - see
// this module's own doc comment above for why.
export const configWarningRules: ConfigWarningRule[] = rulesData as ConfigWarningRule[]

/** Replaces every `{fieldName}` placeholder in template with
 * String(context[fieldName]) - a placeholder whose field is missing
 * or null/undefined is left untouched (rather than becoming the
 * literal string "undefined"/"null"), so an author's typo in a
 * placeholder name is visible in the rendered warning instead of
 * silently producing garbled text. */
function interpolate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => {
    const value = context[key]
    return value === undefined || value === null ? placeholder : String(value)
  })
}

/**
 * Evaluates every rule's JMESPath query against facts (a plain,
 * JSON-round-tripped object - see lib/configWarnings.ts's
 * buildConfigWarningFacts) and returns one ConfigWarning per matched
 * array element. A query that doesn't evaluate to an array, or throws
 * (a malformed JMESPath expression), is treated as "no matches" for
 * that one rule rather than failing the whole banner - logged via
 * console.error so a broken rule is loudly visible in development
 * without taking down every other rule's warnings with it.
 */
export function evaluateConfigWarningRules(
  facts: Record<string, unknown>,
  rules: ConfigWarningRule[] = configWarningRules,
): ConfigWarning[] {
  const warnings: ConfigWarning[] = []
  for (const rule of rules) {
    let matches: unknown
    try {
      matches = search(facts, rule.query)
    } catch (err) {
      console.error(`config warning rule "${rule.id}": query failed`, err)
      continue
    }
    if (!Array.isArray(matches)) {
      if (matches !== null && matches !== undefined) {
        console.error(`config warning rule "${rule.id}": query did not evaluate to an array`, matches)
      }
      continue
    }
    for (const match of matches) {
      const context: Record<string, unknown> =
        typeof match === 'object' && match !== null ? (match as Record<string, unknown>) : {}
      warnings.push({
        id: interpolate(rule.id, context),
        message: interpolate(rule.message, context),
      })
    }
  }
  return warnings
}
