/**
 * Shared Tailwind class strings for the small, hand-rolled forms used
 * throughout the Firewall UI (Zones, Rulesets, Groups, Global Options)
 * and the Config Tree editor. Each of these strings was previously
 * duplicated verbatim across several files (with occasional drift -
 * e.g. one place missing `disabled:opacity-50`); consolidating them
 * here means a future design tweak (border radius, focus ring color,
 * spacing) only needs to change in one place, instead of requiring a
 * search across every page that happened to have copy-pasted the same
 * string. This also matters for consistency as more pages (DHCP) reuse
 * the same form patterns.
 */

/** Text/number/select input style used across the Firewall pages'
 * forms and the Config Tree editor's inline edit fields. */
export const inputClass =
  'rounded border border-surface-border bg-surface-800 px-2 py-1 font-mono text-xs text-white outline-none focus:border-accent-500'

/** Field label wrapper (label text stacked above its input). */
export const labelClass = 'flex flex-col gap-1 text-xs text-slate-400'

/** Secondary/utility button (e.g. "+ Add member", "+ Add interface").
 * Combine with a background color modifier at the call site, e.g.
 * `` `bg-accent-600 ${buttonClass}` ``. */
export const buttonClass =
  'rounded px-2 py-1 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50'
