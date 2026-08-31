// Package api implements the backend-for-frontend HTTP API: it serves
// the SPA's requests, holds the VyOS API key, and translates browser
// requests into calls against the VyOS REST client. It holds no
// durable state of its own.
package api

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/walnuss0815/vyos-client/backend/internal/auth"
	"github.com/walnuss0815/vyos-client/backend/internal/ingress"
	"github.com/walnuss0815/vyos-client/backend/internal/selfupgrade"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// Server wires together the VyOS client, the auth/session engine, and
// the HTTP handlers.
type Server struct {
	VyOS     *vyos.Client
	Sessions *auth.SessionManager
	Verifier auth.CredentialVerifier
	Limiter  *auth.LoginLimiter
	Logger   *slog.Logger

	// Version is this binary's own release version (see
	// cmd/vyos-client's `version` var), surfaced via /healthz - not
	// VyOS state. "dev" for local/non-release builds, same as that
	// var's own default.
	Version string

	// CookiesSecure controls the Secure flag on issued cookies. Should
	// be true in production (the backend always serves HTTPS); a
	// build/dev flag can disable it for local HTTP development only.
	CookiesSecure bool

	// SafeApplyDefaultSeconds is surfaced to the frontend as the
	// suggested default commit-confirm countdown.
	SafeApplyDefaultSeconds int

	// ConfigWarningsEnabled is surfaced to the frontend (via
	// handleSystemInfo) so it knows whether to show the config
	// warnings banner at all - see config.Config.ConfigWarningsEnabled
	// for the full rationale on why this is opt-in.
	ConfigWarningsEnabled bool

	// SelfUpgradeEnabled mirrors config.Config.SelfUpgradeEnabled -
	// surfaced to the frontend (via handleSystemInfo) so it knows
	// whether to show the System > Upgrades tab as enabled or
	// disabled-with-instructions.
	SelfUpgradeEnabled bool
	// SelfUpgradeContainerName mirrors
	// config.Config.SelfUpgradeContainerName. Only meaningful (and
	// only read) when SelfUpgradeEnabled is true.
	SelfUpgradeContainerName string
	// SelfUpgradeGitHub is the GitHub releases client used by
	// handleSelfUpgradeStatus - nil when SelfUpgradeEnabled is false,
	// in which case that handler never calls it (see its own doc
	// comment). Constructed once at startup (cmd/vyos-client/serve.go)
	// rather than per-request, so its internal cache (see
	// selfupgrade.Client.ListReleases) is actually shared across
	// requests.
	SelfUpgradeGitHub *selfupgrade.Client

	// IngressEnabled mirrors config.Config.IngressEnabled - surfaced
	// to the frontend (via handleSystemInfo) so it knows whether to
	// show the Ingress nav group at all.
	IngressEnabled bool
	// IngressStore holds the configured Ingress entries - nil when
	// IngressEnabled is false, in which case every ingress handler
	// below returns a "not enabled"/empty response without touching
	// it (see their own doc comments). Constructed once at startup
	// (cmd/vyos-client/serve.go), not per-request, since it owns the
	// single ingress.json file on disk and its in-memory cache.
	IngressStore *ingress.Store
	// IngressProxy serves the actual proxied requests
	// (ingress.PathPrefix + "<name>/...") - nil when IngressEnabled is
	// false, in which case the route below isn't even registered (see
	// Routes), so a request to that path falls through to this same
	// mux's normal 404 rather than reaching a nil handler.
	IngressProxy *ingress.Proxy
}

// loginPath is the frontend SPA's login route - see
// auth.RequireSessionForBrowsing's use in Routes below.
const loginPath = "/login"

// Routes returns the fully-wired HTTP handler for the backend, with all
// middleware applied.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	// Unauthenticated.
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	// The router's hostname/version, shown on the login page before
	// the user has a session - see handleSystemInfo's doc comment for
	// why this is safe to leave unauthenticated.
	mux.HandleFunc("GET /api/system/info", s.handleSystemInfo)

	// Authenticated (session cookie required); state-changing methods
	// additionally require a matching CSRF token.
	authed := func(h http.HandlerFunc) http.Handler {
		return auth.RequireSession(s.Sessions, s.CookiesSecure)(auth.RequireCSRF(h))
	}

	mux.Handle("POST /api/auth/logout", authed(s.handleLogout))
	mux.Handle("GET /api/auth/session", authed(s.handleSessionInfo))

	mux.Handle("GET /api/config/tree", authed(s.handleGetConfigTree))
	mux.Handle("GET /api/config/set-commands", authed(s.handleGetSetCommands))
	mux.Handle("POST /api/config/reveal", authed(s.handleReveal))
	mux.Handle("POST /api/config/commit", authed(s.handleCommit))
	mux.Handle("POST /api/config/commit/confirm", authed(s.handleCommitConfirm))
	mux.Handle("POST /api/config/save", authed(s.handleSave))
	mux.Handle("POST /api/config/import", authed(s.handleImportConfig))

	mux.Handle("GET /api/system/resources", authed(s.handleSystemResources))
	mux.Handle("POST /api/system/reboot", authed(s.handleReboot))
	mux.Handle("POST /api/system/poweroff", authed(s.handlePoweroff))

	mux.Handle("GET /api/system/images", authed(s.handleSystemImages))
	mux.Handle("POST /api/system/images", authed(s.handleAddSystemImage))
	mux.Handle("DELETE /api/system/images", authed(s.handleDeleteSystemImage))
	mux.Handle("GET /api/system/self-upgrade", authed(s.handleSelfUpgradeStatus))
	mux.Handle("GET /api/interfaces", authed(s.handleInterfaces))
	mux.Handle("GET /api/routes", authed(s.handleRoutes))
	mux.Handle("GET /api/dhcp/leases", authed(s.handleDHCPLeases))
	mux.Handle("GET /api/logs", authed(s.handleLogs))

	mux.Handle("GET /api/container/images", authed(s.handleContainerImages))
	mux.Handle("POST /api/container/images", authed(s.handlePullContainerImage))
	mux.Handle("DELETE /api/container/images", authed(s.handleDeleteContainerImage))

	mux.Handle("GET /api/files/roots", authed(s.handleFileBrowserRoots))
	mux.Handle("GET /api/files", authed(s.handleFiles))

	mux.Handle("GET /api/load-balancing/wan/status", authed(s.handleWANLoadBalanceStatus))
	mux.Handle("GET /api/load-balancing/haproxy/status", authed(s.handleHAProxyStatus))

	mux.Handle("GET /api/high-availability/vrrp/status", authed(s.handleVRRPStatus))
	mux.Handle("GET /api/high-availability/conntrack-sync/status", authed(s.handleConntrackSyncStatus))

	mux.Handle("GET /api/qos/shaper-status", authed(s.handleQosShaperStatus))

	mux.Handle("GET /api/pki/expiry", authed(s.handlePKIExpiry))

	mux.Handle("GET /api/ingress", authed(s.handleIngressList))
	mux.Handle("POST /api/ingress", authed(s.handleIngressCreate))
	mux.Handle("GET /api/ingress/{name}", authed(s.handleIngressGet))
	mux.Handle("PUT /api/ingress/{name}", authed(s.handleIngressUpdate))
	mux.Handle("DELETE /api/ingress/{name}", authed(s.handleIngressDelete))

	// The actual proxied traffic - reached by direct browser
	// navigation (a new tab, not the SPA's fetch() calls), so this
	// uses RequireSessionForBrowsing (redirect to the login page)
	// instead of the JSON-401 authed() helper above, and deliberately
	// has no method restriction in its pattern (unlike every /api/...
	// route) since it must proxy whatever method the upstream app's
	// own UI happens to use. No RequireCSRF either - an upstream app
	// has no way to send this app's own CSRF token back. Only
	// registered at all when the feature is enabled, so a disabled
	// deployment gets this mux's ordinary 404 for that path instead
	// of reaching a nil IngressProxy.
	if s.IngressProxy != nil {
		mux.Handle(ingress.PathPrefix, auth.RequireSessionForBrowsing(s.Sessions, s.CookiesSecure, loginPath)(s.IngressProxy))
	}

	return requestLogger(s.Logger)(mux)
}

func requestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)
			logger.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", rec.status,
				"duration_ms", time.Since(start).Milliseconds(),
			)
		})
	}
}

// statusRecorder wraps http.ResponseWriter to capture the status code
// for request logging. It implements Unwrap (returning the real,
// underlying ResponseWriter) rather than separately implementing
// http.Flusher/http.Hijacker/deadline-setting itself - http's own
// ResponseController (used internally by httputil.ReverseProxy for
// the Ingress proxy's Flush/Hijack needs - see internal/ingress.Proxy
// - and directly by handlers like handlePullContainerImage's
// SetWriteDeadline call) follows Unwrap to find the real
// ResponseWriter's capabilities through this wrapper, so nothing
// wrapped by requestLogger below loses access to them.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}
