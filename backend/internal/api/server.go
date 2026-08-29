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
}

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
// for request logging. It deliberately does not forward http.Flusher
// or http.Hijacker: nothing on this server currently streams (SSE) or
// hijacks (WebSocket) a connection, but if a future handler needs
// either, wrapping it here would silently lose that capability - a
// type assertion for http.Flusher/http.Hijacker on this wrapper simply
// fails rather than erroring loudly. Add explicit pass-through methods
// if that's ever needed.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}
