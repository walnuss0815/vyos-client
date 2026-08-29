import Ajv from 'ajv'
import { search } from 'jmespath'
import rulesData from './configWarningRules.json'
import schema from './configWarningRules.schema.json'

/**
 * Data-driven rules for the config-warnings banner - see
 * configWarningRules.schema.json for the full shape/rationale and
 * configWarningRules.json for the actual rules. This module loads and
 * validates that data against its own JSON Schema (via ajv - a real
 * JSON Schema validator, not ad-hoc field checks, so a malformed rule
 * fails loudly and specifically at module load rather than silently
 * producing no warnings or a confusing error deep inside a JMESPath
 * evaluation), and evaluates each rule's JMESPath query
 * (evaluateConfigWarningRules) against the facts object
 * lib/configWarnings.ts builds from already-typed config.
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

const ajv = new Ajv({ allErrors: true })
const validateRules = ajv.compile(schema)

/** Validates configWarningRules.json against configWarningRules
 * .schema.json once, at module load. Throwing here (rather than
 * logging and continuing with possibly-malformed data) is deliberate:
 * a broken rules file should fail the build/tests immediately, the
 * same "fail loud, fail early" treatment this app gives every other
 * structurally-invalid startup configuration. */
function loadRules(): ConfigWarningRule[] {
  if (!validateRules(rulesData)) {
    const details = ajv.errorsText(validateRules.errors, { separator: '; ' })
    throw new Error(`configWarningRules.json failed schema validation: ${details}`)
  }
  return rulesData as ConfigWarningRule[]
}

export const configWarningRules: ConfigWarningRule[] = loadRules()

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
