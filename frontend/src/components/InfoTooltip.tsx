/**
 * A small "i" icon that reveals a short explanatory note on hover or
 * keyboard focus - for VyOS-specific jargon (crypto algorithm names,
 * protocol modes, non-obvious defaults/side-effects) that isn't
 * self-explanatory from the field label alone.
 *
 * Text passed here must be original wording, not copied from VyOS's
 * own `<help>`/documentation text: this app is Apache-2.0 licensed,
 * VyOS's docs and interface-definition XML are GPLv2 - verbatim
 * copying would create a license conflict. Write short, factual
 * descriptions in your own words; link to docs.vyos.io for anything
 * that needs more depth than a sentence or two.
 *
 * Pure-CSS hover/focus reveal (Tailwind's group-hover/group-focus-within)
 * rather than JS-driven open state - no positioning library, no event
 * listeners, nothing to clean up on unmount. See FieldLabel.tsx for
 * the common "label text + this icon, stacked above an input" wrapper
 * most call sites want instead of using this directly.
 *
 * The trigger is a `<span role="button">`, deliberately NOT a real
 * `<button>` element: FieldLabel nests this inside a `<label>`
 * alongside the actual field, and `<button>` is one of HTML's
 * "labelable" elements - a `<label>` implicitly associates with the
 * first labelable descendant in tree order, so a real `<button>`
 * placed before the field would silently steal that association away
 * from the input/select the label is actually meant for (breaking
 * both real accessibility and any getByLabelText-based test). `<span>`
 * isn't labelable, so it's inert for that purpose while still being
 * keyboard-focusable (tabIndex=0) and exposed as a button via
 * `role="button"` for assistive tech.
 *
 * Gotcha for hint text: the trigger's accessible name IS the full
 * `text` string (via aria-label), which testing-library's
 * getByLabelText/getAllByLabelText will match against on its own, not
 * just as part of the field it sits next to. If a hint happens to
 * contain another nearby field's exact label as a substring (e.g. a
 * "Network group" hint that says "...instead of Address group..."),
 * `getByLabelText(/address group/i)` will ambiguously match both the
 * real Address group field AND this tooltip - seen in practice while
 * writing these. Phrase hints to avoid echoing a sibling field's exact
 * label text verbatim - including a field's OWN label text (e.g. a
 * "Peer-group" field's hint must not itself contain the phrase
 * "peer-group"), which is just as real a self-collision.
 *
 * Separate gotcha specifically for checkboxes: placing this inside the
 * same `<label>` that wraps a checkbox (the established pattern here -
 * `<label><input type="checkbox"/>Text<InfoTooltip .../></label>`)
 * means the tooltip's aria-label text becomes PART of the checkbox's
 * own computed accessible name too (browsers/testing-library
 * concatenate a label's full text content, including descendant
 * aria-labels, when deriving the name of the control it implicitly
 * labels) - not just attached to a separate element the way it is for
 * FieldLabel's non-labelable-input case. A test asserting an
 * *exactly*-anchored checkbox name (`getByRole('checkbox', { name:
 * /^cdp$/i })`) will stop matching once a hint is added, since the
 * name becomes "CDP <hint text>" - seen in practice while writing
 * these. Existing exact-anchored tests for a checkbox that gains a
 * hint need loosening to a prefix/substring match instead (e.g.
 * `/^cdp/i`), which is still precise as long as no sibling checkbox
 * shares that prefix.
 */
export default function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span
        role="button"
        tabIndex={0}
        aria-label={text}
        className="text-slate-500 outline-none hover:text-slate-300 focus-visible:text-slate-300"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.4} className="h-3.5 w-3.5">
          <circle cx="10" cy="10" r="7.5" />
          <path strokeLinecap="round" d="M10 9v4.5" />
          <path strokeLinecap="round" d="M10 6.5h.01" />
        </svg>
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-surface-border bg-surface-800 px-2.5 py-1.5 text-xs font-normal normal-case leading-snug text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}
