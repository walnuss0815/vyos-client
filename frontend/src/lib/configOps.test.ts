import { describe, expect, it } from 'vitest'
import { multiValueDiffOps } from './configOps'

describe('multiValueDiffOps', () => {
  it('sets added values and deletes removed ones', () => {
    expect(multiValueDiffOps(['a', 'b'], ['x', 'y'], ['y', 'z'])).toEqual([
      { op: 'set', path: ['a', 'b'], value: 'z' },
      { op: 'delete', path: ['a', 'b'], value: 'x' },
    ])
  })

  it('returns [] when nothing changed', () => {
    expect(multiValueDiffOps(['a'], ['x'], ['x'])).toEqual([])
  })
})
