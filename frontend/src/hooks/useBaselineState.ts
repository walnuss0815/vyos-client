import { useState, type Dispatch, type SetStateAction } from 'react'

/**
 * `useState` for a settings form that edits a snapshot of server
 * config (`baseline`, typically `someConfigToFormValues(config)`):
 * works like `useState(baseline)`, but resets the form whenever the
 * baseline itself changes.
 *
 * A plain `useState(() => toFormValues(config))` only looks at the
 * config on first render. After a rollback, a config import, an edit
 * in the Config Tree or any other refetch the form kept showing the
 * old values while Save diffed them against the new config, quietly
 * queueing ops that brought the replaced settings back.
 *
 * The baseline is compared by content (JSON), not identity, because
 * parsed config objects are rebuilt whenever the pending-changes
 * store changes; only an actual change in the server's values should
 * discard what the user is typing. Form values are plain strings,
 * booleans and arrays, so JSON is exact for them. The reset happens
 * during render (the "adjust state when a prop changes" pattern), not
 * in an effect, so there is no frame showing stale values.
 */
export function useBaselineState<V>(baseline: V): [V, Dispatch<SetStateAction<V>>] {
  const signature = JSON.stringify(baseline)
  const [values, setValues] = useState(baseline)
  const [previousSignature, setPreviousSignature] = useState(signature)
  if (signature !== previousSignature) {
    setPreviousSignature(signature)
    setValues(baseline)
  }
  return [values, setValues]
}
