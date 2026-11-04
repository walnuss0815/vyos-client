// Helpers for walking the untyped JSON tree VyOS returns for a config
// section. VyOS emits a single-valued leaf as a bare string, a
// multi-valued leaf as an array, and a valueless flag node as an empty
// object, so every parser has to normalize these shapes.

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Stringifies any scalar; undefined/null (an absent leaf) stay undefined. */
export function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  return String(v)
}

/** Normalizes a leaf of any shape into an array: absent is empty, a scalar
 * of any type becomes a one-element array. */
export function asArray(v: unknown): string[] {
  if (v === undefined || v === null) return []
  if (Array.isArray(v)) return v.map(String)
  return [String(v)]
}

/** Like asArray, but only a bare string counts as a single value - any other
 * non-array (number, object, ...) is treated as absent. */
export function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (typeof v === 'string') return [v]
  return []
}

/** Reads `node[key]`, or undefined if `node` isn't an object. */
export function child(node: unknown, key: string): unknown {
  if (!isRecord(node)) return undefined
  return node[key]
}

/** Whether a valueless flag node (an empty object in the tree) is set. */
export function isFlagPresent(node: unknown, key: string): boolean {
  return isRecord(node) && key in node
}
