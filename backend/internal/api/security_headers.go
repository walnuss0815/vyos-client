package api

import "net/http"

// cspPolicy is a strict, single-origin Content-Security-Policy: this
// app is a self-contained SPA with no third-party scripts/styles/
// fonts/images and no legitimate reason to be framed by another page.
// style-src keeps 'unsafe-inline' for a handful of genuinely dynamic
// inline styles (e.g. live-computed progress-bar widths, chart
// positioning) that can't be expressed as static classes - CSS
// injection is lower-severity than script injection, and script-src
// itself has no such exception (see frontend/public/theme-init.js,
// extracted out of index.html specifically so the early theme-
// detection script no longer needs to be inline).
const cspPolicy = "default-src 'self'; " +
	"script-src 'self'; " +
	"style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data:; " +
	"font-src 'self'; " +
	"connect-src 'self'; " +
	"frame-ancestors 'none'; " +
	"base-uri 'none'; " +
	"form-action 'self'"

// SecurityHeaders is HTTP middleware setting a baseline set of
// security-related response headers on every response - both the API
// (JSON) and the embedded SPA's own HTML/asset responses, so it wraps
// the OUTER mux in cmd/vyos-client/serve.go (everything this process
// serves), not just Server.Routes()'s own API-only inner mux.
//
// This is deliberate defense-in-depth independent of network
// topology: this app's own documented threat model is "LAN-only,
// never WAN-reachable," but that doesn't by itself prevent
// clickjacking or MIME-sniffing against a browser on a phished or
// otherwise compromised LAN client, and these headers cost nothing
// functionally for a single-origin app with no legitimate reason to
// be framed or to load third-party content. See docs/security.md.
//
// tlsEnabled controls whether Strict-Transport-Security is sent -
// advertising HSTS while actually serving plain HTTP would be
// actively harmful (it would tell browsers to *require* HTTPS for
// this host going forward, breaking the next plain-HTTP visit).
func SecurityHeaders(tlsEnabled bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Referrer-Policy", "no-referrer")
			h.Set("Content-Security-Policy", cspPolicy)
			if tlsEnabled {
				h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			}
			next.ServeHTTP(w, r)
		})
	}
}
