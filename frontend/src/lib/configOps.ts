import type { ConfigOp } from './vyosApi'

/** Diffs a multi-value leaf: `set` for each added value, then `delete`
 * of just the removed values (never the whole leaf). */
export function multiValueDiffOps(path: string[], oldValues: readonly string[], newValues: readonly string[]): ConfigOp[] {
  const oldSet = new Set(oldValues)
  const newSet = new Set(newValues)
  const ops: ConfigOp[] = []
  for (const value of newSet) {
    if (!oldSet.has(value)) ops.push({ op: 'set', path, value })
  }
  for (const value of oldSet) {
    if (!newSet.has(value)) ops.push({ op: 'delete', path, value })
  }
  return ops
}
