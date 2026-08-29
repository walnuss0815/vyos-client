/**
 * Props to spread onto freeform `<input>` elements that browser
 * extensions (password managers, Grammarly, translators) have no
 * legitimate reason to attach to — config path/value editors, not
 * login fields.
 *
 * Why this matters: these extensions inject DOM nodes (icons,
 * wrappers) directly into inputs outside React's control. When React
 * later unmounts or reorders that input (e.g. after Queue/Add/Cancel),
 * the DOM no longer matches what React expects, and the next
 * reconciliation throws
 * `NotFoundError: Failed to execute 'insertBefore' on 'Node'`
 * (or `removeChild`) — a benign but crash-looking error. See
 * https://github.com/facebook/react/issues/17256.
 *
 * These are the standard, widely-used opt-out attributes for the major
 * extensions; there's no single standard so listing several is
 * expected. Do NOT use this on actual login/credential fields (see
 * pages/LoginPage.tsx), which should keep normal autofill behavior.
 */
export const noExtensionInputProps = {
  autoComplete: 'off',
  spellCheck: false,
  // 1Password
  'data-1p-ignore': true,
  // LastPass
  'data-lpignore': true,
  // Dashlane
  'data-form-type': 'other',
  // Bitwarden
  'data-bwignore': true,
  // Grammarly
  'data-gramm': false,
  'data-gramm_editor': false,
  'data-enable-grammarly': false,
} as const
