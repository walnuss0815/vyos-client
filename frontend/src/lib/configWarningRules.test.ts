import { describe, expect, it } from 'vitest'
import { configWarningRules, evaluateConfigWarningRules, type ConfigWarningRule } from './configWarningRules'

describe('configWarningRules', () => {
  it('loads and validates configWarningRules.json without throwing', () => {
    expect(configWarningRules.length).toBeGreaterThan(0)
    for (const rule of configWarningRules) {
      expect(typeof rule.id).toBe('string')
      expect(typeof rule.query).toBe('string')
      expect(typeof rule.message).toBe('string')
    }
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
