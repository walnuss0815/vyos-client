package api_test

import (
	"bufio"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/api"
	"github.com/walnuss0815/vyos-client/backend/internal/auth"
	"github.com/walnuss0815/vyos-client/backend/internal/ingress"
	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// newIngressProxyTestEnv builds a testEnv with IngressStore/
// IngressProxy already set before Routes() is called (Routes()
// decides once, at construction time, whether to register the
// /ingress/ mount at all - see Server.Routes's doc comment) - unlike
// newIngressTestEnv (ingress_handlers_test.go), which only needs the
// /api/ingress CRUD endpoints to see a non-nil IngressStore, and can
// therefore set it after the fact since those handlers re-check it on
// every request.
func newIngressProxyTestEnv(t *testing.T, entries ...ingress.Entry) *testEnv {
	t.Helper()

	fakeVyOS := testutil.New("test-api-key")
	t.Cleanup(fakeVyOS.Close)
	vyosClient, err := vyos.New(vyos.Config{BaseURL: fakeVyOS.URL(), APIKey: "test-api-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}

	store, err := ingress.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("ingress.NewStore: %v", err)
	}
	for _, e := range entries {
		if _, err := store.Create(e); err != nil {
			t.Fatalf("Create(%s): %v", e.Name, err)
		}
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	hash, err := auth.HashPassword("s3cret-password")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	loginLimiter := auth.NewLoginLimiter()
	srv := &api.Server{
		VyOS:                    vyosClient,
		Sessions:                auth.NewSessionManager([]byte("test-session-secret")),
		Verifier:                auth.NewStaticVerifier("admin", hash, loginLimiter),
		Limiter:                 loginLimiter,
		Logger:                  logger,
		CookiesSecure:           false,
		SafeApplyDefaultSeconds: 90,
		IngressEnabled:          true,
		IngressStore:            store,
		IngressProxy:            ingress.NewProxy(store, logger),
	}

	ts := httptest.NewServer(srv.Routes())
	t.Cleanup(ts.Close)

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookiejar.New: %v", err)
	}
	return &testEnv{t: t, fakeVyOS: fakeVyOS, apiServer: srv, server: ts, client: &http.Client{Jar: jar}, jar: jar}
}

func TestIngressProxyRoute_RequiresAuthRedirectsToLogin(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()
	e := newIngressProxyTestEnv(t, ingress.Entry{Name: "nas", TargetURL: upstream.URL})

	// A plain client (no cookie jar pre-populated with a session, and
	// not following redirects) so the redirect itself can be
	// observed.
	client := &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Get(e.server.URL + "/ingress/nas/")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusFound {
		t.Errorf("status = %d, want 302", resp.StatusCode)
	}
	if got := resp.Header.Get("Location"); got != "/login" {
		t.Errorf("Location = %q, want /login", got)
	}
}

func TestIngressProxyRoute_AuthenticatedRequestReachesUpstream(t *testing.T) {
	var gotPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = w.Write([]byte("upstream ok"))
	}))
	defer upstream.Close()
	e := newIngressProxyTestEnv(t, ingress.Entry{Name: "nas", TargetURL: upstream.URL})
	e.login(t)

	resp, err := e.client.Get(e.server.URL + "/ingress/nas/dashboard")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "upstream ok" {
		t.Errorf("body = %q, want upstream ok", body)
	}
	if gotPath != "/dashboard" {
		t.Errorf("upstream saw path %q, want /dashboard", gotPath)
	}
}

func TestIngressProxyRoute_UnknownIngressReturns404(t *testing.T) {
	e := newIngressProxyTestEnv(t)
	e.login(t)

	resp, err := e.client.Get(e.server.URL + "/ingress/ghost/")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

// TestIngressProxyRoute_SupportsProtocolUpgrade is the key regression
// test behind fixing statusRecorder (server.go) to implement Unwrap:
// httputil.ReverseProxy needs to Hijack the underlying connection to
// relay a protocol upgrade (the mechanism WebSocket connections use)
// end to end, and requestLogger's statusRecorder sits in front of
// IngressProxy in the real middleware chain (see Routes). Without
// Unwrap, http.ResponseController.Hijack() (used internally by
// ReverseProxy) can't see through statusRecorder to the real
// Hijacker, and this test fails with a "can't switch protocols"
// error instead of completing the raw byte exchange below.
func TestIngressProxyRoute_SupportsProtocolUpgrade(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hj, ok := w.(http.Hijacker)
		if !ok {
			http.Error(w, "no hijack", http.StatusInternalServerError)
			return
		}
		conn, bufrw, err := hj.Hijack()
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()
		_, _ = bufrw.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
		_ = bufrw.Flush()
		line, err := bufrw.ReadString('\n')
		if err != nil {
			return
		}
		_, _ = bufrw.WriteString("echo: " + line)
		_ = bufrw.Flush()
	}))
	defer upstream.Close()

	e := newIngressProxyTestEnv(t, ingress.Entry{Name: "nas", TargetURL: upstream.URL})
	e.login(t)

	u, err := url.Parse(e.server.URL)
	if err != nil {
		t.Fatalf("url.Parse: %v", err)
	}
	var sessionCookie string
	for _, c := range e.jar.Cookies(u) {
		if c.Name == auth.SessionCookieName {
			sessionCookie = c.Value
		}
	}
	if sessionCookie == "" {
		t.Fatal("expected a session cookie after login")
	}

	conn, err := net.Dial("tcp", u.Host)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer func() { _ = conn.Close() }()

	req := fmt.Sprintf(
		"GET /ingress/nas/ws HTTP/1.1\r\nHost: %s\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nCookie: %s=%s\r\n\r\n",
		u.Host, auth.SessionCookieName, sessionCookie,
	)
	if _, err := conn.Write([]byte(req)); err != nil {
		t.Fatalf("write request: %v", err)
	}

	br := bufio.NewReader(conn)
	statusLine, err := br.ReadString('\n')
	if err != nil {
		t.Fatalf("read status line: %v", err)
	}
	if !strings.Contains(statusLine, "101") {
		t.Fatalf("status line = %q, want 101 Switching Protocols", statusLine)
	}
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			t.Fatalf("read headers: %v", err)
		}
		if line == "\r\n" {
			break
		}
	}

	if _, err := conn.Write([]byte("ping\n")); err != nil {
		t.Fatalf("write ping: %v", err)
	}
	reply, err := br.ReadString('\n')
	if err != nil {
		t.Fatalf("read reply: %v", err)
	}
	if reply != "echo: ping\n" {
		t.Errorf("reply = %q, want %q", reply, "echo: ping\n")
	}
}

// TestIngressProxyRoute_NotRegisteredWhenDisabled guards the
// Routes()-time (not per-request) decision to only register the
// /ingress/ mount when IngressProxy is non-nil - a disabled
// deployment should see this mux's ordinary "not found" for that
// path, not a panic from a nil handler.
func TestIngressProxyRoute_NotRegisteredWhenDisabled(t *testing.T) {
	e := newTestEnv(t) // IngressProxy left nil
	e.login(t)

	resp, err := e.client.Get(e.server.URL + "/ingress/nas/")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}
