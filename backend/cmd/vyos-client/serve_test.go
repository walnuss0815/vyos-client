package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/ingress"
)

// TestBuildMux_RoutesIngressPathToAPIHandler is the regression test
// for a real bug: the Ingress proxy route was registered inside
// api.Server.Routes()'s own inner mux (so it inherits requestLogger
// and auth), but the outer mux built here never forwarded
// ingress.PathPrefix to that handler in the first place - every
// request for /ingress/<name>/... silently fell through to the "/"
// pattern (the embedded SPA fallback) instead, which serves this
// app's own index.html for any path it doesn't recognize as a static
// asset. This went unnoticed because every other test exercises
// api.Server.Routes() directly (via httptest.NewServer), never this
// outer assembly - see docs/roadmap.md for how this was diagnosed.
func TestBuildMux_RoutesIngressPathToAPIHandler(t *testing.T) {
	var apiHit, webappHit bool
	apiHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiHit = true
		w.WriteHeader(http.StatusOK)
	})
	webappHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		webappHit = true
		w.WriteHeader(http.StatusOK)
	})
	mux := buildMux(apiHandler, webappHandler)

	req := httptest.NewRequest(http.MethodGet, ingress.PathPrefix+"some-entry/", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if !apiHit {
		t.Error("expected a request under ingress.PathPrefix to reach apiHandler")
	}
	if webappHit {
		t.Error("expected a request under ingress.PathPrefix NOT to reach webappHandler (the SPA fallback)")
	}
}

func TestBuildMux_RoutesAPIAndHealthzToAPIHandler(t *testing.T) {
	for _, path := range []string{"/api/system/info", "/healthz"} {
		t.Run(path, func(t *testing.T) {
			var apiHit bool
			apiHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				apiHit = true
			})
			webappHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
			mux := buildMux(apiHandler, webappHandler)

			req := httptest.NewRequest(http.MethodGet, path, nil)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			if !apiHit {
				t.Errorf("expected %s to reach apiHandler", path)
			}
		})
	}
}

func TestBuildMux_FallsBackToWebappHandlerForUnknownPaths(t *testing.T) {
	var webappHit bool
	apiHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
	webappHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		webappHit = true
	})
	mux := buildMux(apiHandler, webappHandler)

	req := httptest.NewRequest(http.MethodGet, "/some-spa-route", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if !webappHit {
		t.Error("expected an unrecognized path to fall back to webappHandler")
	}
}
