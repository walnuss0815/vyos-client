package api

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/walnuss0815/vyos-client/backend/internal/auth"
)

func TestSourceKey(t *testing.T) {
	tests := []struct {
		name       string
		remoteAddr string
		want       string
	}{
		{"ipv4 unchanged", "192.0.2.10:1234", "192.0.2.10"},
		{"ipv6 reduced to /64", "[2001:db8:1:2:aaaa:bbbb:cccc:dddd]:1234", "2001:db8:1:2::"},
		{"ipv4-mapped ipv6 treated as ipv4", "[::ffff:192.0.2.10]:1234", "192.0.2.10"},
		{"no port falls back to the raw address", "not-an-address", "not-an-address"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
			r.RemoteAddr = tt.remoteAddr
			if got := sourceKey(r); got != tt.want {
				t.Errorf("sourceKey(%q) = %q, want %q", tt.remoteAddr, got, tt.want)
			}
		})
	}
}

func TestSourceKey_IPv6AddressesInOne64ShareAKey(t *testing.T) {
	a := httptest.NewRequest(http.MethodPost, "/", nil)
	a.RemoteAddr = "[2001:db8:1:2::1]:1000"
	b := httptest.NewRequest(http.MethodPost, "/", nil)
	b.RemoteAddr = "[2001:db8:1:2:ffff::9]:2000"
	c := httptest.NewRequest(http.MethodPost, "/", nil)
	c.RemoteAddr = "[2001:db8:1:3::1]:1000"

	if sourceKey(a) != sourceKey(b) {
		t.Errorf("addresses in the same /64 got different keys: %q vs %q", sourceKey(a), sourceKey(b))
	}
	if sourceKey(a) == sourceKey(c) {
		t.Errorf("addresses in different /64s share key %q", sourceKey(a))
	}
}

type funcVerifier func(ctx context.Context, sourceKey, username, password string) error

func (f funcVerifier) Verify(ctx context.Context, sourceKey, username, password string) error {
	return f(ctx, sourceKey, username, password)
}

func newLoginTestServer(v auth.CredentialVerifier) *Server {
	return &Server{
		Sessions: auth.NewSessionManager([]byte("test-session-secret")),
		Verifier: v,
		Limiter:  auth.NewLoginLimiter(),
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
}

func loginRequestWith(password string) *http.Request {
	body := `{"username":"admin","password":"` + password + `"}`
	r := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.RemoteAddr = "192.0.2.10:1234"
	return r
}

func TestHandleLogin_RejectsOversizedPassword(t *testing.T) {
	var called atomic.Bool
	s := newLoginTestServer(funcVerifier(func(context.Context, string, string, string) error {
		called.Store(true)
		return nil
	}))

	w := httptest.NewRecorder()
	s.handleLogin(w, loginRequestWith(strings.Repeat("a", maxLoginPasswordBytes+1)))

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if called.Load() {
		t.Error("verifier was called for an oversized password")
	}

	w = httptest.NewRecorder()
	s.handleLogin(w, loginRequestWith(strings.Repeat("a", maxLoginPasswordBytes)))
	if w.Code != http.StatusOK {
		t.Errorf("status for a password at the limit = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestHandleLogin_LimitsConcurrentVerifications(t *testing.T) {
	var running, peak atomic.Int32
	release := make(chan struct{})
	s := newLoginTestServer(funcVerifier(func(context.Context, string, string, string) error {
		n := running.Add(1)
		defer running.Add(-1)
		for {
			p := peak.Load()
			if n <= p || peak.CompareAndSwap(p, n) {
				break
			}
		}
		<-release
		return nil
	}))

	const requests = 5
	var wg sync.WaitGroup
	for range requests {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s.handleLogin(httptest.NewRecorder(), loginRequestWith("pw"))
		}()
	}

	deadline := time.Now().Add(5 * time.Second)
	for running.Load() < int32(cap(loginVerifySlots)) && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	// Give any extra request a chance to (wrongly) get past the limit.
	time.Sleep(50 * time.Millisecond)
	close(release)
	wg.Wait()

	if got := peak.Load(); got != int32(cap(loginVerifySlots)) {
		t.Errorf("peak concurrent verifications = %d, want %d", got, cap(loginVerifySlots))
	}
}

func TestHandleLogin_CancelledWhileWaitingForSlot(t *testing.T) {
	s := newLoginTestServer(funcVerifier(func(context.Context, string, string, string) error {
		t.Error("verifier called without a free slot")
		return nil
	}))
	for range cap(loginVerifySlots) {
		loginVerifySlots <- struct{}{}
	}
	t.Cleanup(func() {
		for range cap(loginVerifySlots) {
			<-loginVerifySlots
		}
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	w := httptest.NewRecorder()
	s.handleLogin(w, loginRequestWith("pw").WithContext(ctx))

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}
