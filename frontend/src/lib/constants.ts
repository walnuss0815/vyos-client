/** Shown wherever the router's real hostname (from GET /api/system/info)
 * hasn't loaded yet, or as a fallback if that query fails - on the
 * Layout sidebar/document title (`Layout.tsx`) and the pre-login
 * screen (`LoginPage.tsx`), which both need the exact same fallback so
 * the router's identity is never left showing "undefined" or a stale
 * previously-viewed router's title. */
export const DEFAULT_DOCUMENT_TITLE = 'VyOS Client'
