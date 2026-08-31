package ingress_test

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/auth"
	"github.com/walnuss0815/vyos-client/backend/internal/ingress"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func newTestStore(t *testing.T, entries ...ingress.Entry) *ingress.Store {
	t.Helper()
	store, err := ingress.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	for _, e := range entries {
		if _, err := store.Create(e); err != nil {
			t.Fatalf("Create(%s): %v", e.Name, err)
		}
	}
	return store
}

func TestProxy_ForwardsToTarget(t *testing.T) {
	var gotPath, gotHost string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotHost = r.Host
		_, _ = w.Write([]byte("hello from upstream"))
	}))
	defer upstream.Close()

	store := newTestStore(t, ingress.Entry{Name: "nas", TargetURL: upstream.URL})
	proxy := ingress.NewProxy(store, testLogger())

	req := httptest.NewRequest(http.MethodGet, "/ingress/nas/files/report.pdf", nil)
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "hello from upstream" {
		t.Errorf("body = %q, want hello from upstream", rec.Body.String())
	}
	if gotPath != "/files/report.pdf" {
		t.Errorf("upstream saw path %q, want /files/report.pdf (the /ingress/nas prefix should be stripped)", gotPath)
	}
	upstreamURL, _ := url.Parse(upstream.URL)
	if gotHost != upstreamURL.Host {
		t.Errorf("upstream saw Host %q, want %q", gotHost, upstreamURL.Host)
	}
}

func TestProxy_ForwardsToTargetWithOwnPathPrefix(t *testing.T) {
	var gotPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	store := newTestStore(t, ingress.Entry{Name: "nas", TargetURL: upstream.URL + "/app"})
	proxy := ingress.NewProxy(store, testLogger())

	req := httptest.NewRequest(http.MethodGet, "/ingress/nas/settings", nil)
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	if gotPath != "/app/settings" {
		t.Errorf("upstream saw path %q, want /app/settings", gotPath)
	}
}

func TestProxy_RequestToIngressRootHasSlashPath(t *testing.T) {
	var gotPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	store := newTestStore(t, ingress.Entry{Name: "nas", TargetURL: upstream.URL})
	proxy := ingress.NewProxy(store, testLogger())

	req := httptest.NewRequest(http.MethodGet, "/ingress/nas", nil)
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	if gotPath != "/" {
		t.Errorf("upstream saw path %q, want /", gotPath)
	}
}

func TestProxy_InjectsConfiguredHeaders(t *testing.T) {
	var gotAuth, gotOverride string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotOverride = r.Header.Get("X-Custom")
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	store := newTestStore(t, ingress.Entry{
		Name:      "nas",
		TargetURL: upstream.URL,
		Headers: []ingress.Header{
			{Name: "Authorization", Value: "Bearer secret-token"},
			{Name: "X-Custom", Value: "configured"},
		},
	})
	proxy := ingress.NewProxy(store, testLogger())

	req := httptest.NewRequest(http.MethodGet, "/ingress/nas/", nil)
	req.Header.Set("X-Custom", "from-browser") // must be overridden, not merged
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	if gotAuth != "Bearer secret-token" {
		t.Errorf("Authorization = %q, want Bearer secret-token", gotAuth)
	}
	if gotOverride != "configured" {
		t.Errorf("X-Custom = %q, want configured (overriding the browser's own value)", gotOverride)
	}
}

func TestProxy_StripsOwnSessionAndCSRFCookies(t *testing.T) {
	var gotCookie string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotCookie = r.Header.Get("Cookie")
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	store := newTestStore(t, ingress.Entry{Name: "nas", TargetURL: upstream.URL})
	proxy := ingress.NewProxy(store, testLogger())

	req := httptest.NewRequest(http.MethodGet, "/ingress/nas/", nil)
	req.AddCookie(&http.Cookie{Name: auth.SessionCookieName, Value: "session-secret"})
	req.AddCookie(&http.Cookie{Name: auth.CSRFCookieName, Value: "csrf-secret"})
	req.AddCookie(&http.Cookie{Name: "upstream_app_session", Value: "keep-me"})
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	if gotCookie != "upstream_app_session=keep-me" {
		t.Errorf("upstream saw Cookie %q, want only the non-vyos-client cookie forwarded", gotCookie)
	}
}

func TestProxy_RewritesSetCookiePath(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{Name: "app_session", Value: "abc", Path: "/"})
		http.SetCookie(w, &http.Cookie{Name: "sub_session", Value: "xyz", Path: "/admin"})
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	store := newTestStore(t, ingress.Entry{Name: "nas", TargetURL: upstream.URL})
	proxy := ingress.NewProxy(store, testLogger())

	req := httptest.NewRequest(http.MethodGet, "/ingress/nas/", nil)
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	cookies := rec.Result().Cookies()
	paths := map[string]string{}
	for _, c := range cookies {
		paths[c.Name] = c.Path
	}
	if paths["app_session"] != "/ingress/nas/" {
		t.Errorf("app_session Path = %q, want /ingress/nas/", paths["app_session"])
	}
	if paths["sub_session"] != "/ingress/nas/admin" {
		t.Errorf("sub_session Path = %q, want /ingress/nas/admin", paths["sub_session"])
	}
}

func TestProxy_RewritesSameOriginRedirect(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", "http://"+r.Host+"/login")
		w.WriteHeader(http.StatusFound)
	}))
	defer upstream.Close()

	store := newTestStore(t, ingress.Entry{Name: "nas", TargetURL: upstream.URL})
	proxy := ingress.NewProxy(store, testLogger())

	req := httptest.NewRequest(http.MethodGet, "/ingress/nas/", nil)
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	if got := rec.Header().Get("Location"); got != "/ingress/nas/login" {
		t.Errorf("Location = %q, want /ingress/nas/login", got)
	}
}

func TestProxy_RewritesRelativeRedirect(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", "/dashboard")
		w.WriteHeader(http.StatusFound)
	}))
	defer upstream.Close()

	store := newTestStore(t, ingress.Entry{Name: "nas", TargetURL: upstream.URL})
	proxy := ingress.NewProxy(store, testLogger())

	req := httptest.NewRequest(http.MethodGet, "/ingress/nas/login", nil)
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	if got := rec.Header().Get("Location"); got != "/ingress/nas/dashboard" {
		t.Errorf("Location = %q, want /ingress/nas/dashboard", got)
	}
}

func TestProxy_LeavesCrossOriginRedirectUntouched(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", "https://example.com/somewhere-else")
		w.WriteHeader(http.StatusFound)
	}))
	defer upstream.Close()

	store := newTestStore(t, ingress.Entry{Name: "nas", TargetURL: upstream.URL})
	proxy := ingress.NewProxy(store, testLogger())

	req := httptest.NewRequest(http.MethodGet, "/ingress/nas/", nil)
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	if got := rec.Header().Get("Location"); got != "https://example.com/somewhere-else" {
		t.Errorf("Location = %q, want the cross-origin URL left untouched", got)
	}
}

func TestProxy_UnknownIngressReturns404(t *testing.T) {
	store := newTestStore(t)
	proxy := ingress.NewProxy(store, testLogger())

	req := httptest.NewRequest(http.MethodGet, "/ingress/ghost/", nil)
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}

func TestProxy_UpstreamUnreachableReturns502(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	upstreamURL := upstream.URL
	upstream.Close() // close immediately so the target is unreachable

	store := newTestStore(t, ingress.Entry{Name: "nas", TargetURL: upstreamURL})
	proxy := ingress.NewProxy(store, testLogger())

	req := httptest.NewRequest(http.MethodGet, "/ingress/nas/", nil)
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", rec.Code)
	}
}

func TestProxy_SkipTLSVerifyAllowsSelfSignedUpstream(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	defer upstream.Close()

	store := newTestStore(t, ingress.Entry{Name: "nas", TargetURL: upstream.URL, SkipTLSVerify: true})
	proxy := ingress.NewProxy(store, testLogger())

	req := httptest.NewRequest(http.MethodGet, "/ingress/nas/", nil)
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
}

func TestProxy_WithoutSkipTLSVerifyRejectsSelfSignedUpstream(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	defer upstream.Close()

	store := newTestStore(t, ingress.Entry{Name: "nas", TargetURL: upstream.URL, SkipTLSVerify: false})
	proxy := ingress.NewProxy(store, testLogger())

	req := httptest.NewRequest(http.MethodGet, "/ingress/nas/", nil)
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502 (TLS verification should fail against a self-signed cert)", rec.Code)
	}
}
