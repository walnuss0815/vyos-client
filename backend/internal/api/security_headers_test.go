package api_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/api"
)

func TestSecurityHeaders_SetsBaselineHeaders(t *testing.T) {
	handler := api.SecurityHeaders(true)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	cases := map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"Referrer-Policy":        "no-referrer",
	}
	for header, want := range cases {
		if got := rec.Header().Get(header); got != want {
			t.Errorf("%s = %q, want %q", header, got, want)
		}
	}

	csp := rec.Header().Get("Content-Security-Policy")
	if csp == "" {
		t.Fatal("expected a Content-Security-Policy header to be set")
	}
	for _, want := range []string{
		"default-src 'self'",
		"script-src 'self'",
		"frame-ancestors 'none'",
		"base-uri 'none'",
		"form-action 'self'",
	} {
		if !strings.Contains(csp, want) {
			t.Errorf("Content-Security-Policy = %q, want it to contain %q", csp, want)
		}
	}
	// script-src must NOT allow 'unsafe-inline' - the whole point of
	// extracting frontend/public/theme-init.js out of index.html was
	// to make this safe to omit.
	if strings.Contains(csp, "script-src 'self' 'unsafe-inline'") || strings.Contains(csp, "script-src 'unsafe-inline'") {
		t.Errorf("Content-Security-Policy = %q, script-src must not allow 'unsafe-inline'", csp)
	}
}

func TestSecurityHeaders_SetsHSTSOnlyWhenTLSEnabled(t *testing.T) {
	t.Run("TLS enabled", func(t *testing.T) {
		handler := api.SecurityHeaders(true)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if got := rec.Header().Get("Strict-Transport-Security"); got == "" {
			t.Error("expected Strict-Transport-Security to be set when TLS is enabled")
		}
	})

	t.Run("TLS disabled", func(t *testing.T) {
		handler := api.SecurityHeaders(false)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		// Advertising HSTS while actually serving plain HTTP would
		// tell browsers to require HTTPS for this host going
		// forward, breaking the very next plain-HTTP visit - must
		// never be set in this mode.
		if got := rec.Header().Get("Strict-Transport-Security"); got != "" {
			t.Errorf("Strict-Transport-Security = %q, want unset when TLS is disabled", got)
		}
	})
}

func TestSecurityHeaders_AppliesToUnauthenticatedRoutes(t *testing.T) {
	// The whole point of wrapping the outer mux (see serve.go) rather
	// than only api.Server.Routes()'s inner one is that these headers
	// must also cover unauthenticated responses (the login flow, the
	// SPA's own HTML) - verified here against an unauthenticated
	// request through a full Server.
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/system/info", nil)
	defer func() { _ = resp.Body.Close() }()

	// api.Server.Routes() alone (used by newTestEnv) doesn't include
	// SecurityHeaders - that's only wired up at the outer-mux level in
	// cmd/vyos-client/serve.go, which this package-level test can't
	// reach. This test instead directly wraps Routes() with
	// SecurityHeaders the same way serve.go does, confirming the
	// combination behaves correctly end to end.
	wrapped := api.SecurityHeaders(true)(e.apiServer.Routes())
	ts := httptest.NewServer(wrapped)
	defer ts.Close()

	resp2, err := http.Get(ts.URL + "/api/system/info")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp2.Body.Close() }()
	if resp2.Header.Get("X-Frame-Options") != "DENY" {
		t.Errorf("X-Frame-Options = %q, want DENY on an unauthenticated route", resp2.Header.Get("X-Frame-Options"))
	}
}
