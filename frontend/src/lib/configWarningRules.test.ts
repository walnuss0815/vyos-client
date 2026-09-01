import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import { configWarningRules, evaluateConfigWarningRules, type ConfigWarningRule } from './configWarningRules'
import rulesData from './configWarningRules.json'
import schema from './configWarningRules.schema.json'

describe('configWarningRules', () => {
  it('loads configWarningRules.json', () => {
    expect(configWarningRules.length).toBeGreaterThan(0)
    for (const rule of configWarningRules) {
      expect(typeof rule.id).toBe('string')
      expect(typeof rule.query).toBe('string')
      expect(typeof rule.message).toBe('string')
    }
  })

  // Real JSON Schema validation (not just the ad-hoc field checks
  // above) against configWarningRules.schema.json - deliberately kept
  // here, in the test suite, rather than in configWarningRules.ts
  // itself: ajv's compile() calls `new Function()` to build an
  // executable validator, which a strict Content-Security-Policy
  // blocks in a real browser (see that module's own doc comment for
  // the full incident this caused). Node/Vitest enforces no such
  // policy, so ajv works fine here - this test still fails loudly if
  // a future edit to configWarningRules.json doesn't match the schema,
  // it just does so at test time instead of in every user's browser.
  it('validates configWarningRules.json against configWarningRules.schema.json', () => {
    const ajv = new Ajv({ allErrors: true })
    const validate = ajv.compile(schema)
    const valid = validate(rulesData)
    if (!valid) {
      throw new Error(`configWarningRules.json failed schema validation: ${ajv.errorsText(validate.errors, { separator: '; ' })}`)
    }
    expect(valid).toBe(true)
  })
})

describe('evaluateConfigWarningRules', () => {
  it('produces one warning per matched array element, interpolating {field} from that element', () => {
    const rules: ConfigWarningRule[] = [
      { id: 'greeting-{name}', query: 'people[?age > `18`]', message: 'Hello {name}, age {age}.' },
    ]
    const facts = { people: [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 12 }] }
    expect(evaluateConfigWarningRules(facts, rules)).toEqual([
      { id: 'greeting-Alice', message: 'Hello Alice, age 30.' },
    ])
  })

  it('leaves a placeholder untouched when the matched field is missing', () => {
    const rules: ConfigWarningRule[] = [{ id: 'x', query: '[`{}`]', message: 'value is {missing}' }]
    expect(evaluateConfigWarningRules({}, rules)).toEqual([{ id: 'x', message: 'value is {missing}' }])
  })

  it('treats a query that evaluates to a non-array as zero matches instead of throwing', () => {
    const rules: ConfigWarningRule[] = [{ id: 'x', query: '`"not an array"`', message: 'unreachable' }]
    expect(evaluateConfigWarningRules({}, rules)).toEqual([])
  })

  it('treats a query that evaluates to null as zero matches instead of throwing', () => {
    const rules: ConfigWarningRule[] = [{ id: 'x', query: 'nothing.here', message: 'unreachable' }]
    expect(evaluateConfigWarningRules({}, rules)).toEqual([])
  })

  it('skips a rule whose query is malformed JMESPath rather than throwing', () => {
    const rules: ConfigWarningRule[] = [
      { id: 'broken', query: '((( invalid jmespath', message: 'unreachable' },
      { id: 'ok', query: '[`{}`]', message: 'fine' },
    ]
    expect(evaluateConfigWarningRules({}, rules)).toEqual([{ id: 'ok', message: 'fine' }])
  })

  it('returns nothing when there are no rules', () => {
    expect(evaluateConfigWarningRules({}, [])).toEqual([])
  })
})
