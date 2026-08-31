package ingress

import (
	"crypto/tls"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/walnuss0815/vyos-client/backend/internal/auth"
)

// PathPrefix is the outer mux path prefix a Proxy is mounted under -
// see cmd/vyos-client/serve.go. Exported as a constant, rather than a
// convention only baked into serve.go, so the mount point and this
// file's own prefix-stripping logic can never drift out of sync with
// each other.
const PathPrefix = "/ingress/"

// Proxy is an http.Handler that reverse-proxies requests under
// PathPrefix + "<name>/..." to the matching Entry's TargetURL,
// injecting that entry's configured request headers and rewriting
// upstream Location/Set-Cookie response headers to stay under the
// same proxy path. Mounted behind
// auth.RequireSessionForBrowsing in serve.go - see that file's
// comment for why auth.RequireCSRF is deliberately NOT also applied
// here (upstream apps have no way to send our CSRF token back).
//
// Known limitation (see docs/architecture.md's "Ingress" section):
// this only rewrites what it can see - an upstream app's own HTML/JS
// that hardcodes absolute paths (e.g. loading "/assets/app.js"
// instead of a relative path) will still break, since there's no HTML
// rewriting here. Many self-hosted UIs work fine under a path prefix;
// some don't.
type Proxy struct {
	store  *Store
	logger *slog.Logger

	mu         sync.Mutex
	transports map[bool]*http.Transport // keyed by Entry.SkipTLSVerify
}

// NewProxy constructs a Proxy serving entries from store.
func NewProxy(store *Store, logger *slog.Logger) *Proxy {
	return &Proxy{store: store, logger: logger, transports: map[bool]*http.Transport{}}
}

// transport returns a shared *http.Transport for the given
// SkipTLSVerify setting, creating it on first use. Only two transports
// ever exist (verify on/off) regardless of how many entries are
// configured, so connection pooling still works normally per upstream
// host.
func (p *Proxy) transport(skipVerify bool) *http.Transport {
	p.mu.Lock()
	defer p.mu.Unlock()
	if t, ok := p.transports[skipVerify]; ok {
		return t
	}
	t := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: 10 * time.Second}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		// Deliberately no ResponseHeaderTimeout: unlike vyos.Client's
		// (fixed, short) API calls, an ingress target is an arbitrary
		// operator-chosen web UI that this proxy has no way to know
		// the expected latency of, and a long-lived/streaming
		// response (a WebSocket upgrade, a slow report render, ...)
		// must not be cut off just because it took a while to start.
		// The outer http.Server's WriteTimeout (extended per-request
		// for this handler - see serve.go) is the actual backstop.
		//nolint:gosec // SkipTLSVerify is an explicit, per-entry, operator-configured opt-in - see Entry.SkipTLSVerify.
		TLSClientConfig: &tls.Config{InsecureSkipVerify: skipVerify},
	}
	p.transports[skipVerify] = t
	return t
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	name, rest, ok := splitPath(r.URL.Path)
	if !ok {
		http.NotFound(w, r)
		return
	}
	entry, found := p.store.Get(name)
	if !found {
		http.Error(w, "no such ingress", http.StatusNotFound)
		return
	}
	target, err := url.Parse(entry.TargetURL)
	if err != nil {
		// Shouldn't happen - Validate already checked this at
		// creation/update time - but fail cleanly rather than
		// panicking on somehow-corrupted stored data.
		p.logger.Error("ingress entry has an unparseable target URL", "ingress", name, "error", err)
		http.Error(w, "ingress misconfigured", http.StatusInternalServerError)
		return
	}
	prefix := PathPrefix + name

	rp := &httputil.ReverseProxy{
		Transport: p.transport(entry.SkipTLSVerify),
		Rewrite: func(pr *httputil.ProxyRequest) {
			// Set the outbound path to just the part past
			// "/ingress/<name>" BEFORE calling SetURL, so its
			// internal path-joining logic joins the target's own
			// path (if any) with that remainder - not with the
			// original, still-prefixed incoming path.
			pr.Out.URL.Path = rest
			pr.Out.URL.RawPath = ""
			pr.SetURL(target)
			pr.SetXForwarded()
			stripOwnCookies(pr.Out)
			for _, h := range entry.Headers {
				pr.Out.Header.Set(h.Name, h.Value)
			}
		},
		ModifyResponse: func(resp *http.Response) error {
			rewriteLocation(resp, prefix, target)
			rewriteSetCookiePaths(resp, prefix)
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			p.logger.Warn("ingress proxy error", "ingress", name, "error", err)
			http.Error(w, "upstream unavailable", http.StatusBadGateway)
		},
	}
	rp.ServeHTTP(w, r)
}

// splitPath splits a request path of the form PathPrefix + "<name>" or
// PathPrefix + "<name>/<rest>" into name and rest (rest defaults to
// "/" when the request targets the ingress root with no trailing
// path). ok is false if p doesn't start with PathPrefix at all, or
// names nothing past it.
func splitPath(p string) (name, rest string, ok bool) {
	if !strings.HasPrefix(p, PathPrefix) {
		return "", "", false
	}
	trimmed := strings.TrimPrefix(p, PathPrefix)
	if trimmed == "" {
		return "", "", false
	}
	if slash := strings.IndexByte(trimmed, '/'); slash != -1 {
		return trimmed[:slash], trimmed[slash:], true
	}
	return trimmed, "/", true
}

// ownCookieNames are this app's own authentication cookies - never
// forwarded to an ingress target, which has no use for them and no
// business receiving this app's own session/CSRF credentials.
var ownCookieNames = map[string]struct{}{
	auth.SessionCookieName: {},
	auth.CSRFCookieName:    {},
}

// stripOwnCookies removes this app's own session/CSRF cookies from
// req's outbound Cookie header before it's forwarded upstream,
// leaving any other cookies (e.g. ones the upstream app itself
// previously set via rewriteSetCookiePaths) untouched.
func stripOwnCookies(req *http.Request) {
	raw := req.Header.Get("Cookie")
	if raw == "" {
		return
	}
	parts := strings.Split(raw, "; ")
	kept := make([]string, 0, len(parts))
	for _, part := range parts {
		name := part
		if i := strings.IndexByte(part, '='); i >= 0 {
			name = part[:i]
		}
		if _, own := ownCookieNames[name]; own {
			continue
		}
		kept = append(kept, part)
	}
	if len(kept) == 0 {
		req.Header.Del("Cookie")
		return
	}
	req.Header.Set("Cookie", strings.Join(kept, "; "))
}

// rewriteLocation rewrites a redirect response's Location header, if
// present, from the upstream's own path space back into this proxy's
// path space (prefix + "/..."), so a redirect the upstream app issues
// (e.g. after a login form) keeps the browser under the proxy instead
// of sending it directly at the upstream's real (router-internal, not
// otherwise reachable) address. A Location pointing at a different
// origin entirely is left untouched - rewriting it would incorrectly
// imply this proxy can also reach that other host.
func rewriteLocation(resp *http.Response, prefix string, target *url.URL) {
	loc := resp.Header.Get("Location")
	if loc == "" {
		return
	}
	u, err := url.Parse(loc)
	if err != nil {
		return
	}
	if u.IsAbs() && !sameOrigin(u, target) {
		return
	}
	u.Scheme = ""
	u.Host = ""
	u.Path = prefix + ensureLeadingSlash(strings.TrimPrefix(u.Path, target.Path))
	resp.Header.Set("Location", u.String())
}

func sameOrigin(u, target *url.URL) bool {
	return strings.EqualFold(u.Scheme, target.Scheme) && strings.EqualFold(u.Host, target.Host)
}

// rewriteSetCookiePaths rewrites the Path attribute of every Set-
// Cookie response header to live under prefix, so cookies from
// different ingress targets sharing this app's single browser origin
// never collide with (or get sent to) one another. A cookie whose
// Path can't be parsed is passed through unmodified rather than
// silently dropped.
func rewriteSetCookiePaths(resp *http.Response, prefix string) {
	raw := resp.Header.Values("Set-Cookie")
	if len(raw) == 0 {
		return
	}
	resp.Header.Del("Set-Cookie")
	for _, line := range raw {
		c, err := http.ParseSetCookie(line)
		if err != nil {
			resp.Header.Add("Set-Cookie", line)
			continue
		}
		c.Path = prefix + ensureLeadingSlash(c.Path)
		resp.Header.Add("Set-Cookie", c.String())
	}
}

// ensureLeadingSlash returns p with exactly one leading "/", treating
// an empty path the same as the root.
func ensureLeadingSlash(p string) string {
	if p == "" {
		return "/"
	}
	if !strings.HasPrefix(p, "/") {
		return "/" + p
	}
	return p
}
