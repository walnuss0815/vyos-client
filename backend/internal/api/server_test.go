package api_test

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/walnuss0815/vyos-client/backend/internal/api"
	"github.com/walnuss0815/vyos-client/backend/internal/auth"
	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// testEnv bundles a fully wired Server (backed by a fake VyOS API) and
// its own httptest.Server, plus a plain http.Client that persists
// cookies like a browser would (needed for the session+CSRF flow).
type testEnv struct {
	t         *testing.T
	fakeVyOS  *testutil.FakeVyOS
	apiServer *api.Server
	server    *httptest.Server
	client    *http.Client
	jar       *cookiejar.Jar
}

// newTestEnvWithVerifier is the shared constructor behind newTestEnv
// and newVyOSUserTestEnv: everything about a testEnv is identical
// between AUTH_MODE=static and AUTH_MODE=vyos-users except which
// auth.CredentialVerifier the Server is wired with, so that's the only
// thing callers customize.
func newTestEnvWithVerifier(t *testing.T, buildVerifier func(vyosClient *vyos.Client, limiter *auth.LoginLimiter) auth.CredentialVerifier) *testEnv {
	t.Helper()

	fakeVyOS := testutil.New("test-api-key")
	t.Cleanup(fakeVyOS.Close)

	vyosClient, err := vyos.New(vyos.Config{BaseURL: fakeVyOS.URL(), APIKey: "test-api-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}

	loginLimiter := auth.NewLoginLimiter()
	srv := &api.Server{
		VyOS:                    vyosClient,
		Sessions:                auth.NewSessionManager([]byte("test-session-secret")),
		Verifier:                buildVerifier(vyosClient, loginLimiter),
		Limiter:                 loginLimiter,
		Logger:                  slog.New(slog.NewTextHandler(io.Discard, nil)),
		CookiesSecure:           false,
		SafeApplyDefaultSeconds: 90,
	}

	ts := httptest.NewServer(srv.Routes())
	t.Cleanup(ts.Close)

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookiejar.New: %v", err)
	}
	return &testEnv{
		t:         t,
		fakeVyOS:  fakeVyOS,
		apiServer: srv,
		server:    ts,
		client:    &http.Client{Jar: jar},
		jar:       jar,
	}
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	hash, err := auth.HashPassword("s3cret-password")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	return newTestEnvWithVerifier(t, func(_ *vyos.Client, limiter *auth.LoginLimiter) auth.CredentialVerifier {
		return auth.NewStaticVerifier("admin", hash, limiter)
	})
}

// newVyOSUserTestEnv builds a testEnv wired for AUTH_MODE=vyos-users
// (auth.VyOSUserVerifier), with the fake VyOS server pre-seeded with a
// real `system login user <username> authentication encrypted-password`
// entry, exercising the whole login flow end-to-end through the real
// HTTP handler chain - not just VyOSUserVerifier in isolation, which
// internal/auth/vyos_verifier_test.go already covers with a fake
// ConfigReader. encryptedPasswordHash should be a genuine crypt(3)
// hash (e.g. vyosUserRealSHA512CryptHash below) for a real end-to-end
// check of the whole verification pipeline.
func newVyOSUserTestEnv(t *testing.T, username, encryptedPasswordHash string) *testEnv {
	t.Helper()
	env := newTestEnvWithVerifier(t, func(vyosClient *vyos.Client, limiter *auth.LoginLimiter) auth.CredentialVerifier {
		return auth.NewVyOSUserVerifier(vyosClient, limiter)
	})

	// Seeded directly on the fake server's in-memory config tree
	// (the same map[string]any shape VyOS's own showConfig JSON
	// uses), rather than a real Configure HTTP round-trip - simpler,
	// and this is fixture setup, not part of what the test itself is
	// exercising.
	env.fakeVyOS.Config["system"] = map[string]any{
		"login": map[string]any{
			"user": map[string]any{
				username: map[string]any{
					"authentication": map[string]any{
						"encrypted-password": encryptedPasswordHash,
					},
				},
			},
		},
	}
	return env
}

// vyosUserRealSHA512CryptHash is a genuine glibc crypt(3) SHA-512
// hash for the plaintext "s3cret-password", generated independently
// of this project's code via `mkpasswd -m sha-512 -S abcdefgh12345678
// s3cret-password` - the same fixture used by
// internal/auth/vyos_verifier_test.go (see that file's doc comment
// for the full rationale on using an independently-generated hash
// rather than round-tripping through this project's own hashing
// code).
const vyosUserRealSHA512CryptHash = "$6$abcdefgh12345678$QP4os7MdHpNrBHQ/JDFr25yyxxc.4mwnFNG245l78B.t1RZNZQ3zKCRnE68hFDlYl1uJtvrFMDkYZ5x/whKXO1"

func (e *testEnv) login(t *testing.T) {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "s3cret-password"})
	resp, err := e.client.Post(e.server.URL+"/api/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("login request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("login: status=%d body=%s", resp.StatusCode, b)
	}
}

// csrfToken returns the current CSRF cookie value, for use in the
// X-CSRF-Token header of mutating requests, exactly as the real
// frontend does.
func (e *testEnv) csrfToken() string {
	u, err := url.Parse(e.server.URL)
	if err != nil {
		return ""
	}
	for _, c := range e.jar.Cookies(u) {
		if c.Name == auth.CSRFCookieName {
			return c.Value
		}
	}
	return ""
}

func (e *testEnv) doJSON(t *testing.T, method, path string, body any) *http.Response {
	t.Helper()
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request body: %v", err)
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, e.server.URL+path, reader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if tok := e.csrfToken(); tok != "" {
		req.Header.Set(auth.CSRFHeaderName, tok)
	}
	resp, err := e.client.Do(req)
	if err != nil {
		t.Fatalf("request %s %s: %v", method, path, err)
	}
	return resp
}

func TestLogin_Success(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodGet, "/api/auth/session", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("session check: status=%d", resp.StatusCode)
	}
	var out map[string]string
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if out["user"] != "admin" {
		t.Errorf("user = %q, want admin", out["user"])
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	e := newTestEnv(t)
	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "wrong"})
	resp, err := e.client.Post(e.server.URL+"/api/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("login request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

// TestLogin_RateLimitedAfterMaxFailedAttempts is a regression test for
// a bug where Server.Limiter (checked by handleLogin before calling
// Verifier.Verify) and the LoginLimiter passed into Verifier were two
// separate instances, so RecordFailure calls made inside Verify never
// reached the limiter handleLogin actually consults. That made the
// 429 "too many failed login attempts" response unreachable in
// production, even though each of the two limiters passed its own
// unit tests in isolation. This test exercises the real HTTP handler
// chain, which is the only place the wiring bug is visible.
func TestLogin_RateLimitedAfterMaxFailedAttempts(t *testing.T) {
	e := newTestEnv(t)
	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "wrong"})

	// LoginLimiter's default MaxAttempts is 5; the 6th failed attempt
	// from the same source should be rate-limited rather than
	// re-checked against the password.
	var lastStatus int
	for i := 0; i < 6; i++ {
		resp, err := e.client.Post(e.server.URL+"/api/auth/login", "application/json", bytes.NewReader(body))
		if err != nil {
			t.Fatalf("login request %d: %v", i, err)
		}
		lastStatus = resp.StatusCode
		_ = resp.Body.Close()
	}
	if lastStatus != http.StatusTooManyRequests {
		t.Fatalf("status after 6 failed attempts = %d, want %d", lastStatus, http.StatusTooManyRequests)
	}
}

func TestLogin_VyOSUserMode_Success(t *testing.T) {
	e := newVyOSUserTestEnv(t, "alice", vyosUserRealSHA512CryptHash)
	body, _ := json.Marshal(map[string]string{"username": "alice", "password": "s3cret-password"})
	resp, err := e.client.Post(e.server.URL+"/api/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("login request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("login: status=%d body=%s", resp.StatusCode, b)
	}

	var out map[string]string
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if out["user"] != "alice" {
		t.Errorf("user = %q, want alice", out["user"])
	}
}

func TestLogin_VyOSUserMode_WrongPassword(t *testing.T) {
	e := newVyOSUserTestEnv(t, "alice", vyosUserRealSHA512CryptHash)
	body, _ := json.Marshal(map[string]string{"username": "alice", "password": "wrong"})
	resp, err := e.client.Post(e.server.URL+"/api/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("login request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestLogin_VyOSUserMode_UnknownUser(t *testing.T) {
	e := newVyOSUserTestEnv(t, "alice", vyosUserRealSHA512CryptHash)
	body, _ := json.Marshal(map[string]string{"username": "bob", "password": "s3cret-password"})
	resp, err := e.client.Post(e.server.URL+"/api/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("login request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

// TestLogin_VyOSUserMode_BackendUnavailable exercises the distinct
// 503 path: if the fake VyOS server itself is unreachable when a
// login is attempted, the client should get a clearly different
// response than "wrong password" (see auth.ErrAuthBackendUnavailable's
// doc comment for why this distinction matters).
func TestLogin_VyOSUserMode_BackendUnavailable(t *testing.T) {
	e := newVyOSUserTestEnv(t, "alice", vyosUserRealSHA512CryptHash)
	e.fakeVyOS.Close() // simulate VyOS's API being unreachable

	body, _ := json.Marshal(map[string]string{"username": "alice", "password": "s3cret-password"})
	resp, err := e.client.Post(e.server.URL+"/api/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("login request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusServiceUnavailable)
	}
}

func TestConfigTree_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/config/tree", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestCommitAndReadBack(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	commitBody := map[string]any{
		"ops": []map[string]any{
			{"op": "set", "path": []string{"system", "host-name"}, "value": "test-router"},
		},
	}
	resp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("commit: status=%d body=%s", resp.StatusCode, b)
	}

	treeResp := e.doJSON(t, http.MethodGet, "/api/config/tree?path=system,host-name", nil)
	defer func() { _ = treeResp.Body.Close() }()
	var out map[string]any
	_ = json.NewDecoder(treeResp.Body).Decode(&out)
	if out["data"] != "test-router" {
		t.Errorf("host-name = %v, want test-router", out["data"])
	}
}

// TestCommit_RateLimited guards the config-commit rate limit
// (Server.CommitLimiter, wired up in Routes via commitRateLimited) -
// a comparatively expensive operation (a real VyOS commit) that VyOS
// itself has no rate limit of its own on.
func TestCommit_RateLimited(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.CommitLimiter = auth.NewRequestLimiter(2, time.Minute)
	e.login(t)

	commitBody := map[string]any{
		"ops": []map[string]any{
			{"op": "set", "path": []string{"system", "host-name"}, "value": "test-router"},
		},
	}
	for i := range 2 {
		resp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			b, _ := io.ReadAll(resp.Body)
			t.Fatalf("commit %d: status=%d body=%s", i+1, resp.StatusCode, b)
		}
	}

	resp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusTooManyRequests {
		t.Errorf("3rd commit: status = %d, want 429", resp.StatusCode)
	}
}

// TestCommit_RateLimitIsPerUser guards against one user's quota
// affecting another's - the limiter is keyed by the authenticated
// username (auth.UserFromContext), not e.g. a shared/global counter.
func TestCommit_RateLimitIsPerUser(t *testing.T) {
	e := newVyOSUserTestEnv(t, "alice", vyosUserRealSHA512CryptHash)
	e.apiServer.CommitLimiter = auth.NewRequestLimiter(1, time.Minute)

	e.fakeVyOS.Config["system"] = map[string]any{
		"login": map[string]any{
			"user": map[string]any{
				"alice": map[string]any{"authentication": map[string]any{"encrypted-password": vyosUserRealSHA512CryptHash}},
				"bob":   map[string]any{"authentication": map[string]any{"encrypted-password": vyosUserRealSHA512CryptHash}},
			},
		},
	}

	commitBody := map[string]any{
		"ops": []map[string]any{
			{"op": "set", "path": []string{"system", "host-name"}, "value": "test-router"},
		},
	}

	loginAs := func(username string) {
		body, _ := json.Marshal(map[string]string{"username": username, "password": "s3cret-password"})
		resp, err := e.client.Post(e.server.URL+"/api/auth/login", "application/json", bytes.NewReader(body))
		if err != nil {
			t.Fatalf("login as %s: %v", username, err)
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("login as %s: status=%d", username, resp.StatusCode)
		}
	}

	loginAs("alice")
	resp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("alice's 1st commit: status = %d, want 200", resp.StatusCode)
	}

	// alice's quota (1) is now exhausted, but bob has his own.
	loginAs("bob")
	resp2 := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
	defer func() { _ = resp2.Body.Close() }()
	if resp2.StatusCode != http.StatusOK {
		t.Errorf("bob's 1st commit: status = %d, want 200 (independent quota from alice)", resp2.StatusCode)
	}
}

// TestCommit_RateLimiterDisabledWhenNil confirms a Server constructed
// without a CommitLimiter (nil) never rate-limits at all, rather than
// panicking - most tests in this file rely on exactly this behavior
// implicitly, but it's worth asserting directly.
func TestCommit_RateLimiterDisabledWhenNil(t *testing.T) {
	e := newTestEnv(t) // CommitLimiter left nil
	e.login(t)

	commitBody := map[string]any{
		"ops": []map[string]any{
			{"op": "set", "path": []string{"system", "host-name"}, "value": "test-router"},
		},
	}
	for i := range 5 {
		resp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("commit %d: status = %d, want 200 (no rate limiting without a CommitLimiter)", i+1, resp.StatusCode)
		}
	}
}

// TestImportConfig_RateLimited confirms the same rate limiter also
// covers /api/config/import, not just /api/config/commit.
func TestImportConfig_RateLimited(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.CommitLimiter = auth.NewRequestLimiter(1, time.Minute)
	e.login(t)

	importBody := map[string]any{"content": "set system host-name 'test-router'\n", "mode": "merge"}

	resp := e.doJSON(t, http.MethodPost, "/api/config/import", importBody)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("1st import: status=%d body=%s", resp.StatusCode, b)
	}

	resp2 := e.doJSON(t, http.MethodPost, "/api/config/import", importBody)
	defer func() { _ = resp2.Body.Close() }()
	if resp2.StatusCode != http.StatusTooManyRequests {
		t.Errorf("2nd import: status = %d, want 429", resp2.StatusCode)
	}
}

// TestCommit_RejectsOversizedBody guards against an authenticated
// client making the server buffer an arbitrarily large request body
// before any size-based rejection - VyOS's own request-body-size-limit
// is a separate, downstream concern the BFF shouldn't rely on as its
// only defense.
func TestCommit_RejectsOversizedBody(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	hugeValue := strings.Repeat("a", 3<<20) // 3 MiB, over the 2 MiB cap
	commitBody := map[string]any{
		"ops": []map[string]any{
			{"op": "set", "path": []string{"system", "host-name"}, "value": hugeValue},
		},
	}
	resp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want %d for an oversized request body", resp.StatusCode, http.StatusBadRequest)
	}
}

// TestSave_TreatsEmptyChunkedBodyAsNoBody is a regression test for a
// bug where handleSave used r.ContentLength != 0 to decide whether a
// body was sent. ContentLength is -1 (not 0) for a chunked/unknown-
// length body (e.g. HTTP/2, or any client that doesn't pre-compute a
// Content-Length header), so an empty chunked body was incorrectly
// treated as "has a body", decoding failed with io.EOF, and Save was
// wrongly rejected with 400 instead of falling back to the default
// (empty) save request the frontend's own body-less style otherwise
// relies on.
func TestSave_TreatsEmptyChunkedBodyAsNoBody(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	req, err := http.NewRequest(http.MethodPost, e.server.URL+"/api/config/save", io.NopCloser(strings.NewReader("")))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.ContentLength = -1 // force chunked / unknown-length semantics
	if tok := e.csrfToken(); tok != "" {
		req.Header.Set(auth.CSRFHeaderName, tok)
	}
	resp, err := e.client.Do(req)
	if err != nil {
		t.Fatalf("save request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNoContent {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status = %d, want 204; body=%s", resp.StatusCode, b)
	}
}

// TestConfigTree_WholeConfigWithoutPathParam is a regression test:
// GET /api/config/tree with no ?path= query param (i.e. "fetch the
// entire configuration", exactly what the Config Tree page's root
// view does) used to fail with a 502 and a VyOS error of "'path'
// field must be a list", because the missing query param produced a
// nil Go path slice, and encoding/json marshals nil []string as JSON
// `null` rather than `[]`. See vyos.path's MarshalJSON and
// TestShowConfig_NilPathFetchesWholeConfig in the vyos package for the
// lower-level regression coverage of the same bug.
func TestConfigTree_WholeConfigWithoutPathParam(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	commitBody := map[string]any{
		"ops": []map[string]any{
			{"op": "set", "path": []string{"system", "host-name"}, "value": "test-router"},
		},
	}
	commitResp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
	_ = commitResp.Body.Close()
	if commitResp.StatusCode != http.StatusOK {
		t.Fatalf("commit: status=%d", commitResp.StatusCode)
	}

	resp := e.doJSON(t, http.MethodGet, "/api/config/tree", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("GET /api/config/tree (no path param): status=%d body=%s", resp.StatusCode, b)
	}

	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	tree, ok := out["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected the whole config tree back, got %T: %v", out["data"], out["data"])
	}
	system, ok := tree["system"].(map[string]any)
	if !ok || system["host-name"] != "test-router" {
		t.Errorf("expected system.host-name = test-router in whole-config response, got %v", tree)
	}
}

func TestCommit_MasksSensitiveValueOnReadBack(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	commitBody := map[string]any{
		"ops": []map[string]any{
			{"op": "set", "path": []string{"service", "https", "api", "keys", "id", "ui", "key"}, "value": "MY-PLAINTEXT-KEY"},
		},
	}
	resp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("commit: status=%d", resp.StatusCode)
	}

	treeResp := e.doJSON(t, http.MethodGet, "/api/config/tree?path=service,https,api,keys,id,ui,key", nil)
	defer func() { _ = treeResp.Body.Close() }()
	var out map[string]any
	_ = json.NewDecoder(treeResp.Body).Decode(&out)
	if out["data"] == "MY-PLAINTEXT-KEY" {
		t.Error("expected sensitive value to be masked in API response, got plaintext")
	}
}

func TestReveal_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	body := map[string]any{"path": []string{"service", "https", "api", "keys", "id", "ui", "key"}}
	respBody, _ := json.Marshal(body)
	resp, err := e.client.Post(e.server.URL+"/api/config/reveal", "application/json", bytes.NewReader(respBody))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestReveal_ReturnsRealValueForSensitivePath(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	commitBody := map[string]any{
		"ops": []map[string]any{
			{"op": "set", "path": []string{"service", "https", "api", "keys", "id", "ui", "key"}, "value": "MY-PLAINTEXT-KEY"},
		},
	}
	commitResp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
	_ = commitResp.Body.Close()
	if commitResp.StatusCode != http.StatusOK {
		t.Fatalf("commit: status=%d", commitResp.StatusCode)
	}

	revealBody := map[string]any{"path": []string{"service", "https", "api", "keys", "id", "ui", "key"}}
	resp := e.doJSON(t, http.MethodPost, "/api/config/reveal", revealBody)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("reveal: status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Value string `json:"value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Value != "MY-PLAINTEXT-KEY" {
		t.Errorf("value = %q, want the real plaintext key", out.Value)
	}
}

// TestReveal_ReturnsRealValueForSensitiveIdentifierValueLeaf guards
// the newer IsMaskedPath case: a container environment variable's
// own key can make its generic "value" leaf revealable even though
// "value" itself is never in the exact-match sensitiveLeafNames list.
func TestReveal_ReturnsRealValueForSensitiveIdentifierValueLeaf(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	commitBody := map[string]any{
		"ops": []map[string]any{
			{"op": "set", "path": []string{"container", "name", "web", "environment", "DB_PASSWORD", "value"}, "value": "hunter2"},
		},
	}
	commitResp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
	_ = commitResp.Body.Close()
	if commitResp.StatusCode != http.StatusOK {
		t.Fatalf("commit: status=%d", commitResp.StatusCode)
	}

	revealBody := map[string]any{"path": []string{"container", "name", "web", "environment", "DB_PASSWORD", "value"}}
	resp := e.doJSON(t, http.MethodPost, "/api/config/reveal", revealBody)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("reveal: status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Value string `json:"value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Value != "hunter2" {
		t.Errorf("value = %q, want the real plaintext value", out.Value)
	}
}

// TestReveal_RejectsNonSensitiveIdentifierValueLeaf guards the flip
// side: an environment variable whose key doesn't look sensitive
// (e.g. TZ) must still be rejected by this endpoint, same as any
// other non-sensitive path.
func TestReveal_RejectsNonSensitiveIdentifierValueLeaf(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	commitBody := map[string]any{
		"ops": []map[string]any{
			{"op": "set", "path": []string{"container", "name", "web", "environment", "TZ", "value"}, "value": "UTC"},
		},
	}
	commitResp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
	_ = commitResp.Body.Close()

	resp := e.doJSON(t, http.MethodPost, "/api/config/reveal",
		map[string]any{"path": []string{"container", "name", "web", "environment", "TZ", "value"}})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

// TestReveal_RejectsNonSensitivePath is the endpoint's core scope
// guard: it must refuse to become a generic "fetch one leaf value"
// endpoint for anything the ordinary (masked) GET /api/config/tree
// already exposes in the clear - both to keep its audit log
// meaningful and its blast radius no wider than its stated purpose.
func TestReveal_RejectsNonSensitivePath(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	commitBody := map[string]any{
		"ops": []map[string]any{{"op": "set", "path": []string{"system", "host-name"}, "value": "router1"}},
	}
	commitResp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
	_ = commitResp.Body.Close()

	resp := e.doJSON(t, http.MethodPost, "/api/config/reveal", map[string]any{"path": []string{"system", "host-name"}})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestReveal_RejectsEmptyPath(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/config/reveal", map[string]any{"path": []string{}})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestReveal_WithoutCSRFTokenRejected(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	body, _ := json.Marshal(map[string]any{"path": []string{"service", "https", "api", "keys", "id", "ui", "key"}})
	req, _ := http.NewRequest(http.MethodPost, e.server.URL+"/api/config/reveal", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// Deliberately omit the CSRF header, even though the cookie jar
	// will still attach the CSRF cookie automatically.
	resp, err := e.client.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403", resp.StatusCode)
	}
}

func TestReveal_NonexistentPathReturnsError(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/config/reveal", map[string]any{
		"path": []string{"service", "https", "api", "keys", "id", "does-not-exist", "key"},
	})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 400 {
		t.Errorf("status = %d, want an error status for a path with no configuration", resp.StatusCode)
	}
}

func TestCommit_WithoutCSRFTokenRejected(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	body, _ := json.Marshal(map[string]any{
		"ops": []map[string]any{{"op": "set", "path": []string{"system", "host-name"}, "value": "x"}},
	})
	req, _ := http.NewRequest(http.MethodPost, e.server.URL+"/api/config/commit", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// Deliberately omit the CSRF header, even though the cookie jar
	// will still attach the CSRF cookie automatically.
	resp, err := e.client.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403", resp.StatusCode)
	}
}

func TestCommit_ConfirmFlow(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	commitBody := map[string]any{
		"ops": []map[string]any{
			{"op": "set", "path": []string{"system", "host-name"}, "value": "test-router"},
		},
		"confirmSeconds": 90,
	}
	resp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
	defer func() { _ = resp.Body.Close() }()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if out["pendingConfirm"] != true {
		t.Errorf("pendingConfirm = %v, want true", out["pendingConfirm"])
	}
	if !e.fakeVyOS.PendingConfirm {
		t.Error("expected fake VyOS server to record a pending confirm")
	}

	confirmResp := e.doJSON(t, http.MethodPost, "/api/config/commit/confirm", nil)
	defer func() { _ = confirmResp.Body.Close() }()
	if confirmResp.StatusCode != http.StatusNoContent {
		t.Errorf("confirm status = %d, want 204", confirmResp.StatusCode)
	}
	if e.fakeVyOS.PendingConfirm {
		t.Error("expected pending confirm to be cleared")
	}
}

func TestSave(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/config/save", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNoContent {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("save: status=%d body=%s", resp.StatusCode, b)
	}
}

func TestImportConfig_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodPost, "/api/config/import", map[string]any{"content": "x", "mode": "merge"})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestImportConfig_Merge(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/config/import", map[string]any{
		"content": "interfaces {\n}\n",
		"mode":    "merge",
	})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}

	last := e.fakeVyOS.Requests[len(e.fakeVyOS.Requests)-1]
	if last.Endpoint != "/config-file" {
		t.Errorf("endpoint = %q, want /config-file", last.Endpoint)
	}
	if !bytes.Contains(last.Data, []byte(`"op":"merge"`)) {
		t.Errorf("expected op=merge, got: %s", last.Data)
	}
}

func TestImportConfig_Load(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/config/import", map[string]any{
		"content": "interfaces {\n}\n",
		"mode":    "load",
	})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}

	last := e.fakeVyOS.Requests[len(e.fakeVyOS.Requests)-1]
	if !bytes.Contains(last.Data, []byte(`"op":"load"`)) {
		t.Errorf("expected op=load, got: %s", last.Data)
	}
}

func TestImportConfig_WithConfirmSecondsStartsCommitConfirmAndIsConfirmable(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/config/import", map[string]any{
		"content":        "interfaces {\n}\n",
		"mode":           "load",
		"confirmSeconds": 90,
	})
	defer func() { _ = resp.Body.Close() }()
	var out map[string]bool
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if resp.StatusCode != http.StatusOK || !out["pendingConfirm"] {
		t.Fatalf("status=%d pendingConfirm=%v, want 200/true", resp.StatusCode, out["pendingConfirm"])
	}
	if !e.fakeVyOS.PendingConfirm {
		t.Fatal("expected fake VyOS to have a pending commit-confirm")
	}

	// Same endpoint used to confirm a regular commit's commit-confirm
	// timer works here too, since it's the same underlying VyOS
	// mechanism regardless of which endpoint started it (see
	// handleCommitConfirm's doc comment).
	confirmResp := e.doJSON(t, http.MethodPost, "/api/config/commit/confirm", nil)
	defer func() { _ = confirmResp.Body.Close() }()
	if confirmResp.StatusCode != http.StatusNoContent {
		t.Fatalf("confirm: status=%d", confirmResp.StatusCode)
	}
	if e.fakeVyOS.PendingConfirm {
		t.Error("expected pending confirm to be cleared")
	}
}

func TestImportConfig_RejectsEmptyContent(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/config/import", map[string]any{"content": "   ", "mode": "merge"})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestImportConfig_RejectsInvalidMode(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/config/import", map[string]any{"content": "x", "mode": "delete-everything"})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestImportConfig_RejectsOutOfRangeConfirmSeconds(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	for _, seconds := range []int{1, 9, 601, 10000} {
		resp := e.doJSON(t, http.MethodPost, "/api/config/import", map[string]any{
			"content":        "x",
			"mode":           "merge",
			"confirmSeconds": seconds,
		})
		_ = resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("confirmSeconds=%d: status = %d, want 400", seconds, resp.StatusCode)
		}
	}
}

func TestCommit_RejectsEmptyOps(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/config/commit", map[string]any{"ops": []map[string]any{}})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

// TestCommit_RejectsOutOfRangeConfirmSeconds guards against relying
// solely on the frontend's HTML min/max attributes (advisory only,
// trivially bypassed by any direct API client) to keep the
// commit-confirm window sane: a 1-second window is close to useless
// (network latency alone could exceed it), and an absurdly large value
// leaves the system in "pending confirm" limbo if the operator forgets
// to confirm. 0 (disabling safe apply entirely) remains valid.
func TestCommit_RejectsOutOfRangeConfirmSeconds(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	for _, seconds := range []int{1, 9, 601, 10000} {
		commitBody := map[string]any{
			"ops":            []map[string]any{{"op": "set", "path": []string{"system", "host-name"}, "value": "r1"}},
			"confirmSeconds": seconds,
		}
		resp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
		_ = resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("confirmSeconds=%d: status = %d, want 400", seconds, resp.StatusCode)
		}
	}
}

func TestInterfaces_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/interfaces", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestInterfaces_ReturnsParsedInterfaces(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowOutputs["interfaces kernel json"] = `[
		{"ifname": "eth0", "mtu": 1500, "operstate": "UP", "flags": ["UP"], "address": "52:54:00:12:34:56",
		 "ifalias": "WAN", "addr_info": [{"family": "inet", "local": "203.0.113.5", "prefixlen": 24, "scope": "global"}]}
	]`

	resp := e.doJSON(t, http.MethodGet, "/api/interfaces", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Interfaces []vyos.Interface `json:"interfaces"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Interfaces) != 1 {
		t.Fatalf("len(Interfaces) = %d, want 1", len(out.Interfaces))
	}
	if out.Interfaces[0].Name != "eth0" || out.Interfaces[0].MAC != "52:54:00:12:34:56" {
		t.Errorf("Interfaces[0] = %+v, want eth0/52:54:00:12:34:56", out.Interfaces[0])
	}
}

func TestRoutes_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/routes", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestRoutes_ReturnsBothFamilies(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowOutputs["ip route json"] = `[{"prefix": "0.0.0.0/0", "protocol": "static", "distance": 1, "metric": 0, "nexthops": [{"ip": "203.0.113.1", "interface_name": "eth0", "active": true}]}]`
	e.fakeVyOS.ShowOutputs["ipv6 route json"] = `[{"prefix": "::/0", "protocol": "static", "distance": 1, "metric": 0, "nexthops": [{"ip": "2001:db8::1", "interface_name": "eth0", "active": true}]}]`

	resp := e.doJSON(t, http.MethodGet, "/api/routes", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		IPv4 []vyos.Route `json:"ipv4"`
		IPv6 []vyos.Route `json:"ipv6"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.IPv4) != 1 || out.IPv4[0].Prefix != "0.0.0.0/0" {
		t.Errorf("IPv4 = %+v, want a single 0.0.0.0/0 route", out.IPv4)
	}
	if len(out.IPv6) != 1 || out.IPv6[0].Prefix != "::/0" {
		t.Errorf("IPv6 = %+v, want a single ::/0 route", out.IPv6)
	}
}

// TestSystemInfo_WorksWithoutAuth is deliberately the opposite of what
// every other data endpoint requires: /api/system/info powers the
// login page's hostname display, so it must work before a session
// exists. Safe because it wraps VyOS's own GET /info, which requires
// no API key either - see handleSystemInfo's doc comment.
func TestSystemInfo_WorksWithoutAuth(t *testing.T) {
	e := newTestEnv(t)
	e.fakeVyOS.Info = map[string]any{
		"hostname": "test-router",
		"version":  "2026.02-rolling",
		"banner":   "Welcome",
	}

	resp := e.doJSON(t, http.MethodGet, "/api/system/info", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Hostname string `json:"hostname"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Hostname != "test-router" {
		t.Errorf("hostname = %q, want test-router", out.Hostname)
	}
}

// TestSystemInfo_ConfigWarningsEnabledDefaultsToFalse guards the
// "disabled by default" requirement at the HTTP-response level, not
// just in config.Load - a test env built with the zero-value Server{}
// literal (ConfigWarningsEnabled left unset) should report false.
func TestSystemInfo_ConfigWarningsEnabledDefaultsToFalse(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/system/info", nil)
	defer func() { _ = resp.Body.Close() }()
	var out struct {
		ConfigWarningsEnabled bool `json:"configWarningsEnabled"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.ConfigWarningsEnabled {
		t.Error("expected configWarningsEnabled to be false by default")
	}
}

func TestSystemInfo_ConfigWarningsEnabledReflectsServerSetting(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.ConfigWarningsEnabled = true

	resp := e.doJSON(t, http.MethodGet, "/api/system/info", nil)
	defer func() { _ = resp.Body.Close() }()
	var out struct {
		ConfigWarningsEnabled bool `json:"configWarningsEnabled"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !out.ConfigWarningsEnabled {
		t.Error("expected configWarningsEnabled to be true when Server.ConfigWarningsEnabled is set")
	}
}

func TestSystemInfo_SelfUpgradeEnabledDefaultsToFalse(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/system/info", nil)
	defer func() { _ = resp.Body.Close() }()
	var out struct {
		SelfUpgradeEnabled bool `json:"selfUpgradeEnabled"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.SelfUpgradeEnabled {
		t.Error("expected selfUpgradeEnabled to be false by default")
	}
}

func TestSystemInfo_SelfUpgradeEnabledReflectsServerSetting(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.SelfUpgradeEnabled = true

	resp := e.doJSON(t, http.MethodGet, "/api/system/info", nil)
	defer func() { _ = resp.Body.Close() }()
	var out struct {
		SelfUpgradeEnabled bool `json:"selfUpgradeEnabled"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !out.SelfUpgradeEnabled {
		t.Error("expected selfUpgradeEnabled to be true when Server.SelfUpgradeEnabled is set")
	}
}

func TestSystemInfo_FileBrowserEnabledDefaultsToFalse(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/system/info", nil)
	defer func() { _ = resp.Body.Close() }()
	var out struct {
		FileBrowserEnabled bool `json:"fileBrowserEnabled"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.FileBrowserEnabled {
		t.Error("expected fileBrowserEnabled to be false by default")
	}
}

func TestSystemInfo_FileBrowserEnabledReflectsServerSetting(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.FileBrowserEnabled = true

	resp := e.doJSON(t, http.MethodGet, "/api/system/info", nil)
	defer func() { _ = resp.Body.Close() }()
	var out struct {
		FileBrowserEnabled bool `json:"fileBrowserEnabled"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !out.FileBrowserEnabled {
		t.Error("expected fileBrowserEnabled to be true when Server.FileBrowserEnabled is set")
	}
}

func TestSystemInfo_ReturnsHostnameAndVersion(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.Info = map[string]any{
		"hostname": "test-router",
		"version":  "2026.02-rolling",
		"banner":   "Welcome",
	}

	resp := e.doJSON(t, http.MethodGet, "/api/system/info", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Hostname string `json:"hostname"`
		Version  string `json:"version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Hostname != "test-router" || out.Version != "2026.02-rolling" {
		t.Errorf("got %+v, want hostname=test-router version=2026.02-rolling", out)
	}
}

// TestSystemInfo_ReturnsLoginBanner guards against a regression back
// to the old behavior (VyOS's /info "banner" field was fetched but
// deliberately discarded before reaching the frontend). It must now
// round-trip as loginBanner, and work pre-auth like the rest of this
// endpoint.
func TestSystemInfo_ReturnsLoginBanner(t *testing.T) {
	e := newTestEnv(t)
	e.fakeVyOS.Info = map[string]any{
		"hostname": "test-router",
		"version":  "2026.02-rolling",
		"banner":   "Authorized access only.",
	}

	resp := e.doJSON(t, http.MethodGet, "/api/system/info", nil)
	defer func() { _ = resp.Body.Close() }()
	var out struct {
		LoginBanner string `json:"loginBanner"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.LoginBanner != "Authorized access only." {
		t.Errorf("loginBanner = %q, want %q", out.LoginBanner, "Authorized access only.")
	}
}

// TestSystemInfo_LoginBannerEmptyWhenVyOSHasNone confirms the field is
// an empty string (not omitted/null) when the router has no banner
// configured, so the frontend's "only render when non-empty" check
// has something predictable to check against.
func TestSystemInfo_LoginBannerEmptyWhenVyOSHasNone(t *testing.T) {
	e := newTestEnv(t)
	e.fakeVyOS.Info = map[string]any{
		"hostname": "test-router",
		"version":  "2026.02-rolling",
		"banner":   "",
	}

	resp := e.doJSON(t, http.MethodGet, "/api/system/info", nil)
	defer func() { _ = resp.Body.Close() }()
	var out struct {
		LoginBanner string `json:"loginBanner"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.LoginBanner != "" {
		t.Errorf("loginBanner = %q, want empty", out.LoginBanner)
	}
}

func TestSystemResources_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/system/resources", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestSystemResources_ReturnsUptimeCPUMemoryStorage(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowOutputs["system uptime"] = "Uptime: 3w 2d 5h 12m 45s\n\n" +
		"Load averages:\n1  minute:   12.3%\n5  minutes:  8.7%\n15 minutes:  5.2%"
	e.fakeVyOS.ShowOutputs["system cpu"] = "CPU socket: 0\nCPU Vendor:       AuthenticAMD\n" +
		"Model:            AMD Ryzen 7 PRO 5850U\nCores:            8\nCurrent MHz:      3943.420"
	e.fakeVyOS.ShowOutputs["system memory"] = "Total: 15.32 GB\nFree:  9.11 GB\nUsed:  6.21 GB"
	e.fakeVyOS.ShowOutputs["system storage"] = "Filesystem: /dev/sda1\nSize:       16G\nUsed:       7.6G (51%)\nAvailable:  7.3G (49%)"

	resp := e.doJSON(t, http.MethodGet, "/api/system/resources", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Uptime  *vyos.SystemUptime  `json:"uptime"`
		CPU     *vyos.SystemCPU     `json:"cpu"`
		Memory  *vyos.SystemMemory  `json:"memory"`
		Storage *vyos.SystemStorage `json:"storage"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Uptime == nil || out.Uptime.Uptime != "3w 2d 5h 12m 45s" {
		t.Errorf("Uptime = %+v", out.Uptime)
	}
	if out.CPU == nil || out.CPU.Cores != 8 {
		t.Errorf("CPU = %+v", out.CPU)
	}
	if out.Memory == nil || out.Memory.TotalBytes == 0 {
		t.Errorf("Memory = %+v", out.Memory)
	}
	if out.Storage == nil || out.Storage.Filesystem != "/dev/sda1" {
		t.Errorf("Storage = %+v", out.Storage)
	}
}

// TestSystemResources_OmitsStorageWhenUnavailable covers VyOS's own
// "not available" message (e.g. running from a bare live CD before
// install) degrading to an omitted field, not a request failure.
func TestSystemResources_OmitsStorageWhenUnavailable(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowOutputs["system uptime"] = "Uptime: 5m 12s\n\nLoad averages:\n1  minute:   0.0%\n5  minutes:  0.0%\n15 minutes:  0.0%"
	e.fakeVyOS.ShowOutputs["system cpu"] = "CPU socket: 0\nModel:            Test CPU\nCores:            2"
	e.fakeVyOS.ShowOutputs["system memory"] = "Total: 1.00 GB\nFree:  0.50 GB\nUsed:  0.50 GB"
	e.fakeVyOS.ShowOutputs["system storage"] = "Storage statistics are not available\n"

	resp := e.doJSON(t, http.MethodGet, "/api/system/resources", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if _, present := out["storage"]; present {
		t.Errorf(`"storage" key present in response, want omitted: %+v`, out)
	}
}

func TestDHCPLeases_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/dhcp/leases", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

// TestDHCPLeases_ResolvesSubnetForMakeStatic is an end-to-end check
// that a lease's IP gets correctly matched against the configured
// DHCP subnet it falls under, which the frontend needs to build the
// right config path for "make static".
func TestDHCPLeases_ResolvesSubnetForMakeStatic(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	commitBody := map[string]any{
		"ops": []map[string]any{
			{
				"op":    "set",
				"path":  []string{"service", "dhcp-server", "shared-network-name", "LAN", "subnet", "192.168.1.0/24", "subnet-id"},
				"value": "1",
			},
		},
	}
	resp := e.doJSON(t, http.MethodPost, "/api/config/commit", commitBody)
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("commit: status=%d body=%s", resp.StatusCode, b)
	}
	_ = resp.Body.Close()

	e.fakeVyOS.ShowOutputs["dhcp server leases"] = `IP Address     MAC address        State   Lease start          Lease expiration     Remaining  Pool  Hostname  Origin
-------------  -----------------  ------  -------------------  -------------------  ---------  ----  --------  ------
192.168.1.134  00:50:79:66:68:09  active  2023/11/29 09:51:05  2023/11/29 10:21:05  0:24:10    LAN   VPCS1     local`

	leasesResp := e.doJSON(t, http.MethodGet, "/api/dhcp/leases", nil)
	defer func() { _ = leasesResp.Body.Close() }()
	if leasesResp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(leasesResp.Body)
		t.Fatalf("status=%d body=%s", leasesResp.StatusCode, b)
	}
	var out struct {
		Leases []struct {
			IPAddress string `json:"ipAddress"`
			Subnet    string `json:"subnet"`
		} `json:"leases"`
	}
	if err := json.NewDecoder(leasesResp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Leases) != 1 {
		t.Fatalf("len(Leases) = %d, want 1", len(out.Leases))
	}
	if out.Leases[0].Subnet != "192.168.1.0/24" {
		t.Errorf("Subnet = %q, want 192.168.1.0/24", out.Leases[0].Subnet)
	}
}

func TestLogs_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/logs?source=system", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

// TestLogs_System_TruncatesToRequestedLineCount also confirms the
// "system" source dispatches to `show log tail <n>` (see
// vyos.ShowLogTailBounded's doc comment for why, not bare `show log`)
// and un-reverses that command's newest-first output back into
// chronological order - the fixture is seeded in the same
// newest-first shape a real `journalctl --reverse` response would be.
func TestLogs_System_TruncatesToRequestedLineCount(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowOutputs["log tail 2"] = "line3\nline2\n"

	resp := e.doJSON(t, http.MethodGet, "/api/logs?source=system&lines=2", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Lines     []string `json:"lines"`
		Truncated bool     `json:"truncated"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Lines) != 2 || out.Lines[0] != "line2" || out.Lines[1] != "line3" {
		t.Errorf("Lines = %v, want [line2 line3]", out.Lines)
	}
	if !out.Truncated {
		t.Errorf("Truncated = false, want true")
	}
}

func TestLogs_UnknownSource_Returns400(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	resp := e.doJSON(t, http.MethodGet, "/api/logs?source=nonsense", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestLogs_MissingSource_Returns400(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	resp := e.doJSON(t, http.MethodGet, "/api/logs", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestLogs_Facility_ValidValueDispatchesCorrectPath(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowOutputs["log facility local0"] = "facility line\n"

	resp := e.doJSON(t, http.MethodGet, "/api/logs?source=facility&facility=local0", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Lines []string `json:"lines"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Lines) != 1 || out.Lines[0] != "facility line" {
		t.Errorf("Lines = %v, want [\"facility line\"]", out.Lines)
	}
}

func TestLogs_Facility_UnknownValueReturns400(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	resp := e.doJSON(t, http.MethodGet, "/api/logs?source=facility&facility=not-a-real-facility", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestLogs_Priority_ValidValueDispatchesCorrectPath(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowOutputs["log priority err"] = "priority line\n"

	resp := e.doJSON(t, http.MethodGet, "/api/logs?source=priority&priority=err", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Lines []string `json:"lines"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Lines) != 1 || out.Lines[0] != "priority line" {
		t.Errorf("Lines = %v, want [\"priority line\"]", out.Lines)
	}
}

func TestLogs_Priority_UnknownValueReturns400(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	resp := e.doJSON(t, http.MethodGet, "/api/logs?source=priority&priority=super-critical", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestLogs_Container_RequiresContainerParam(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	resp := e.doJSON(t, http.MethodGet, "/api/logs?source=container", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestLogs_Container_DispatchesToContainerLogPath(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowOutputs["container log web"] = "container line\n"

	resp := e.doJSON(t, http.MethodGet, "/api/logs?source=container&container=web", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Lines []string `json:"lines"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Lines) != 1 || out.Lines[0] != "container line" {
		t.Errorf("Lines = %v, want [\"container line\"]", out.Lines)
	}
}

// TestLogs_FixedSources_DispatchToTheExpectedOpModePath is a table
// test confirming every curated fixed source (see
// api.fixedLogSources) maps to the op-mode path this app's design
// intends, not just that *some* path was called - a typo in the map
// would otherwise silently query the wrong service's log.
func TestLogs_FixedSources_DispatchToTheExpectedOpModePath(t *testing.T) {
	cases := []struct {
		source      string
		showOutputs string // key into fakeVyOS.ShowOutputs, i.e. the expected op-mode path joined by spaces
	}{
		// "system" dispatches to the bounded `tail` command (with the
		// default line count, since none is given here), not bare
		// "log" - see vyos.ShowLogTailBounded's doc comment.
		{"system", "log tail 500"},
		{"firewall", "log firewall"},
		{"ssh", "log ssh"},
		{"https", "log https"},
		{"dhcp-server", "log dhcp server"},
		{"vpn", "log vpn"},
		{"frr", "log frr"},
	}
	for _, tc := range cases {
		t.Run(tc.source, func(t *testing.T) {
			e := newTestEnv(t)
			e.login(t)
			e.fakeVyOS.ShowOutputs[tc.showOutputs] = "expected line\n"

			resp := e.doJSON(t, http.MethodGet, "/api/logs?source="+tc.source, nil)
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode != http.StatusOK {
				b, _ := io.ReadAll(resp.Body)
				t.Fatalf("status=%d body=%s", resp.StatusCode, b)
			}
			var out struct {
				Lines []string `json:"lines"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
				t.Fatalf("decode: %v", err)
			}
			if len(out.Lines) != 1 || out.Lines[0] != "expected line" {
				t.Errorf("Lines = %v, want [\"expected line\"]", out.Lines)
			}
		})
	}
}

// TestLogs_DefaultsToFiveHundredLinesWhenUnspecified simulates what a
// real, already-bounded `show log tail 500` response looks like
// (exactly 500 lines, since that's what "tail" guarantees server-side)
// rather than a 600-line unbounded one truncated after the fact - the
// "system" source no longer over-fetches and truncates client-side
// (see vyos.ShowLogTailBounded), so there's nothing to simulate
// VyOS over-returning here.
func TestLogs_DefaultsToFiveHundredLinesWhenUnspecified(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	var sb strings.Builder
	for i := 0; i < 500; i++ {
		sb.WriteString("line\n")
	}
	e.fakeVyOS.ShowOutputs["log tail 500"] = sb.String()

	resp := e.doJSON(t, http.MethodGet, "/api/logs?source=system", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Lines     []string `json:"lines"`
		Truncated bool     `json:"truncated"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Lines) != 500 {
		t.Errorf("len(Lines) = %d, want 500 (the default)", len(out.Lines))
	}
	if !out.Truncated {
		t.Errorf("Truncated = false, want true")
	}
}

func TestContainerImages_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/container/images", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestContainerImages_ReturnsParsedList(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowOutputs["container image json"] = `[
		{"Id": "abc123", "Names": ["docker.io/library/nginx:latest"], "Size": 12345, "Containers": 1, "Created": 1778638909}
	]`

	resp := e.doJSON(t, http.MethodGet, "/api/container/images", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Images []struct {
			ID         string   `json:"id"`
			Tags       []string `json:"tags"`
			SizeBytes  int64    `json:"sizeBytes"`
			Containers int      `json:"containers"`
			CreatedAt  float64  `json:"createdAt"`
		} `json:"images"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Images) != 1 {
		t.Fatalf("len(Images) = %d, want 1", len(out.Images))
	}
	img := out.Images[0]
	if img.ID != "abc123" || img.SizeBytes != 12345 || img.Containers != 1 {
		t.Errorf("image = %+v", img)
	}
	if len(img.Tags) != 1 || img.Tags[0] != "docker.io/library/nginx:latest" {
		t.Errorf("Tags = %v, want [docker.io/library/nginx:latest]", img.Tags)
	}
}

func TestPullContainerImage_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodPost, "/api/container/images", map[string]string{"name": "nginx"})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestPullContainerImage_Success(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ContainerImageAddOutputs["docker.io/library/nginx:latest"] = "Pulling...\nDone.\n"

	resp := e.doJSON(t, http.MethodPost, "/api/container/images", map[string]string{"name": "docker.io/library/nginx:latest"})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Message != "Pulling...\nDone.\n" {
		t.Errorf("Message = %q", out.Message)
	}
}

// TestPullContainerImage_RejectsShellMetacharacters guards the input
// validation that stands in for VyOS's own complete lack of it (see
// api.validateContainerImageName's doc comment): VyOS's add_image
// script interpolates the name directly into a shell command with no
// sanitization of its own.
func TestPullContainerImage_RejectsShellMetacharacters(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	cases := []string{
		"nginx; rm -rf /",
		"nginx && echo pwned",
		"nginx`whoami`",
		"nginx $(whoami)",
		"nginx | cat /etc/passwd",
		"",
	}
	for _, name := range cases {
		t.Run(name, func(t *testing.T) {
			resp := e.doJSON(t, http.MethodPost, "/api/container/images", map[string]string{"name": name})
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("name=%q: status = %d, want 400", name, resp.StatusCode)
			}
		})
	}
}

func TestPullContainerImage_AcceptsOrdinaryImageReferences(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	cases := []string{
		"nginx",
		"nginx:latest",
		"docker.io/library/nginx:1.25",
		"registry.example.com:5000/team/app:v1.2.3",
		"nginx@sha256:1cfa4e2b09e127b9c4ed43578d3f3c18e7d44ea47b9ea98475c0cbe9086525f8",
	}
	for _, name := range cases {
		t.Run(name, func(t *testing.T) {
			e.fakeVyOS.ContainerImageAddOutputs[name] = "ok\n"
			resp := e.doJSON(t, http.MethodPost, "/api/container/images", map[string]string{"name": name})
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode != http.StatusOK {
				b, _ := io.ReadAll(resp.Body)
				t.Errorf("name=%q: status=%d body=%s", name, resp.StatusCode, b)
			}
		})
	}
}

func TestPullContainerImage_PropagatesVyOSError(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ContainerImageAddErrors["nonexistent/image:tag"] = "Error: image not known"

	resp := e.doJSON(t, http.MethodPost, "/api/container/images", map[string]string{"name": "nonexistent/image:tag"})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s, want 422", resp.StatusCode, b)
	}
}

func TestDeleteContainerImage_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodDelete, "/api/container/images?name=abc123", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestReboot_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodPost, "/api/system/reboot", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestReboot_Success(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/system/reboot", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNoContent {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
}

func TestReboot_WithoutCSRFTokenRejected(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	req, _ := http.NewRequest(http.MethodPost, e.server.URL+"/api/system/reboot", nil)
	// Deliberately omit the CSRF header, even though the cookie jar
	// will still attach the CSRF cookie automatically.
	resp, err := e.client.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403", resp.StatusCode)
	}
}

// TestReboot_PropagatesVyOSError confirms a downstream failure (the
// router unreachable, in this case) surfaces as an error response
// rather than a false-positive 204 - important here specifically
// since a silently-"successful" reboot/poweroff response the router
// never actually acted on would be a confusing, hard-to-diagnose gap.
func TestReboot_PropagatesVyOSError(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.Close()

	resp := e.doJSON(t, http.MethodPost, "/api/system/reboot", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 400 {
		t.Errorf("status = %d, want an error status when VyOS is unreachable", resp.StatusCode)
	}
}

func TestPoweroff_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodPost, "/api/system/poweroff", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestPoweroff_Success(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/system/poweroff", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNoContent {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
}

func TestPoweroff_WithoutCSRFTokenRejected(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	req, _ := http.NewRequest(http.MethodPost, e.server.URL+"/api/system/poweroff", nil)
	resp, err := e.client.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403", resp.StatusCode)
	}
}

func TestPoweroff_PropagatesVyOSError(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.Close()

	resp := e.doJSON(t, http.MethodPost, "/api/system/poweroff", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 400 {
		t.Errorf("status = %d, want an error status when VyOS is unreachable", resp.StatusCode)
	}
}

func TestDeleteContainerImage_Success(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ContainerImageDeleteOutputs["abc123"] = ""

	resp := e.doJSON(t, http.MethodDelete, "/api/container/images?name=abc123", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
}

func TestDeleteContainerImage_MissingNameReturns400(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	resp := e.doJSON(t, http.MethodDelete, "/api/container/images", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

// TestDeleteContainerImage_InUseErrorSurfacesToTheUser confirms VyOS's
// own "image is in use by a running container" validation error (see
// container.py's delete_image) passes through as a readable message,
// not a generic "failed deleting container image".
func TestDeleteContainerImage_InUseErrorSurfacesToTheUser(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	wantMsg := `Cannot delete image "abc123" because it is currently being used by container "web"!`
	e.fakeVyOS.ContainerImageDeleteErrors["abc123"] = wantMsg

	resp := e.doJSON(t, http.MethodDelete, "/api/container/images?name=abc123", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s, want 422", resp.StatusCode, b)
	}
	var out struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Error != wantMsg {
		t.Errorf("Error = %q, want %q", out.Error, wantMsg)
	}
}

func TestFileBrowserRoots_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/files/roots", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestFileBrowserRoots_DisabledByDefault(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	resp := e.doJSON(t, http.MethodGet, "/api/files/roots", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Enabled bool     `json:"enabled"`
		Roots   []string `json:"roots"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Enabled {
		t.Error("expected enabled=false when Server.FileBrowserEnabled is unset")
	}
	if len(out.Roots) != 0 {
		t.Errorf("expected no roots when disabled, got %+v", out.Roots)
	}
}

func TestFileBrowserRoots_ReturnsTheCuratedList(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.FileBrowserEnabled = true
	e.login(t)
	resp := e.doJSON(t, http.MethodGet, "/api/files/roots", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Enabled bool     `json:"enabled"`
		Roots   []string `json:"roots"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !out.Enabled {
		t.Error("expected enabled=true")
	}
	if len(out.Roots) == 0 {
		t.Fatal("expected at least one browsable root")
	}
}

func TestFiles_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/files?path=/config", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

// TestFiles_DisabledByDefault guards the same {"enabled": false}
// convention as self-upgrade/container-update-checks - the frontend
// distinguishes this from an ordinary empty directory by checking
// Enabled first.
func TestFiles_DisabledByDefault(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	resp := e.doJSON(t, http.MethodGet, "/api/files?path=/config", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Enabled bool   `json:"enabled"`
		Path    string `json:"path"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Enabled {
		t.Error("expected enabled=false when Server.FileBrowserEnabled is unset")
	}
	if out.Path != "" {
		t.Errorf("expected no path when disabled, got %q", out.Path)
	}
}

func TestFiles_DirectoryListing(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.FileBrowserEnabled = true
	e.login(t)
	e.fakeVyOS.ShowOutputs["file /config"] = "########## DIRECTORY LISTING ##########\n" +
		"Path:\t /config\n" +
		"total 8\n" +
		"drwxr-xr-x  2 root  4.0K Jan  1 00:00 scripts/\n" +
		"-rw-r--r--  1 root   123 Jan  1 00:00 config.boot\n"

	resp := e.doJSON(t, http.MethodGet, "/api/files?path=/config", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Path        string `json:"path"`
		IsDirectory bool   `json:"isDirectory"`
		Entries     []struct {
			Name  string `json:"name"`
			IsDir bool   `json:"isDir"`
		} `json:"entries"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !out.IsDirectory || out.Path != "/config" {
		t.Fatalf("out = %+v", out)
	}
	if len(out.Entries) != 2 || out.Entries[0].Name != "scripts" || !out.Entries[0].IsDir {
		t.Errorf("Entries = %+v", out.Entries)
	}
}

func TestFiles_FileView(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.FileBrowserEnabled = true
	e.login(t)
	e.fakeVyOS.ShowOutputs["file /config/config.boot"] = "########## FILE INFO ##########\n" +
		"Type:\t\tASCII text\n" +
		"Owner:\t\troot:vyattacfg\n" +
		"Permissions:\trw-r--r--\n" +
		"Modified:\t2024-01-01 12:00:00\n" +
		"\n" +
		"########## FILE DATA ##########\n" +
		"set system host-name 'vyos'\n"

	resp := e.doJSON(t, http.MethodGet, "/api/files?path="+url.QueryEscape("/config/config.boot"), nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		IsDirectory bool   `json:"isDirectory"`
		Content     string `json:"content"`
		IsBinary    bool   `json:"isBinary"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.IsDirectory || out.IsBinary {
		t.Fatalf("out = %+v", out)
	}
	if out.Content != "set system host-name 'vyos'\n" {
		t.Errorf("Content = %q", out.Content)
	}
}

// TestFiles_RejectsPathsOutsideBrowsableRoots is the whole point of
// this app's own allowlist: VyOS's `show file` itself has no
// restriction at all (confirmed against vyos-1x's file.py) and would
// happily return e.g. /etc/shadow.
func TestFiles_RejectsPathsOutsideBrowsableRoots(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.FileBrowserEnabled = true
	e.login(t)
	for _, p := range []string{"/etc/shadow", "/config/../etc/shadow", "relative", ""} {
		resp := e.doJSON(t, http.MethodGet, "/api/files?path="+url.QueryEscape(p), nil)
		status := resp.StatusCode
		_ = resp.Body.Close()
		if p == "" {
			// Empty defaults to the first browsable root instead of
			// being rejected - see handleFiles.
			continue
		}
		if status != http.StatusBadRequest {
			t.Errorf("path=%q: status = %d, want 400", p, status)
		}
	}
}

func TestFiles_DefaultsToFirstRootWhenPathOmitted(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.FileBrowserEnabled = true
	e.login(t)
	e.fakeVyOS.ShowOutputs["file /config"] = "########## DIRECTORY LISTING ##########\nPath:\t /config\ntotal 0\n"

	resp := e.doJSON(t, http.MethodGet, "/api/files", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Path != "/config" {
		t.Errorf("Path = %q, want /config", out.Path)
	}
}

func TestFiles_PropagatesVyOSNotFoundError(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.FileBrowserEnabled = true
	e.login(t)
	e.fakeVyOS.ShowErrors["file /config/nonexistent"] = "File or directory /config/nonexistent not found."

	resp := e.doJSON(t, http.MethodGet, "/api/files?path="+url.QueryEscape("/config/nonexistent"), nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s, want 422", resp.StatusCode, b)
	}
}

func TestWANLoadBalanceStatus_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/load-balancing/wan/status", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestWANLoadBalanceStatus_ReturnsParsedInterfaces(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowOutputs["wan-load-balance"] = "Interface: eth0\n" +
		"Status: active\n" +
		"Last Status Change: 2024-01-01 12:00:00\n" +
		"Last Interface Success: 0:00:05\n" +
		"Last Interface Failure: N/A\n" +
		"Interface Failures: 0\n"

	resp := e.doJSON(t, http.MethodGet, "/api/load-balancing/wan/status", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Interfaces []struct {
			Interface string `json:"interface"`
			Active    bool   `json:"active"`
		} `json:"interfaces"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Interfaces) != 1 || out.Interfaces[0].Interface != "eth0" || !out.Interfaces[0].Active {
		t.Errorf("Interfaces = %+v", out.Interfaces)
	}
}

func TestWANLoadBalanceStatus_PropagatesUnconfiguredError(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowErrors["wan-load-balance"] = "WAN load-balancing is not configured"

	resp := e.doJSON(t, http.MethodGet, "/api/load-balancing/wan/status", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s, want 422", resp.StatusCode, b)
	}
}

func TestHAProxyStatus_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/load-balancing/haproxy/status", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestHAProxyStatus_ReturnsParsedRows(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowOutputs["load-balancing haproxy"] = "Proxy name    Role      Status    Req rate  Resp time    Last change\n" +
		"------------  --------  --------  --------  -----------  -----------\n" +
		"web           FRONTEND  OPEN      0                       1d2h\n"

	resp := e.doJSON(t, http.MethodGet, "/api/load-balancing/haproxy/status", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Rows []struct {
			ProxyName string `json:"proxyName"`
			Role      string `json:"role"`
		} `json:"rows"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Rows) != 1 || out.Rows[0].ProxyName != "web" || out.Rows[0].Role != "FRONTEND" {
		t.Errorf("Rows = %+v", out.Rows)
	}
}

func TestHAProxyStatus_PropagatesUnconfiguredError(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowErrors["load-balancing haproxy"] = "Haproxy is not configured"

	resp := e.doJSON(t, http.MethodGet, "/api/load-balancing/haproxy/status", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s, want 422", resp.StatusCode, b)
	}
}

func TestVRRPStatus_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/high-availability/vrrp/status", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestVRRPStatus_ReturnsParsedGroups(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	const vrrpFormat = "%-9s  %-9s  %-4s  %-6s  %-8s  %s\n"
	e.fakeVyOS.ShowOutputs["vrrp"] = fmt.Sprintf(vrrpFormat, "Name", "Interface", "VRID", "State", "Priority", "Last Transition") +
		fmt.Sprintf(vrrpFormat, strings.Repeat("-", 9), strings.Repeat("-", 9), strings.Repeat("-", 4), strings.Repeat("-", 6), strings.Repeat("-", 8), strings.Repeat("-", 15)) +
		fmt.Sprintf(vrrpFormat, "OUTSIDE", "eth0", "10", "MASTER", "100", "2s")

	resp := e.doJSON(t, http.MethodGet, "/api/high-availability/vrrp/status", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Groups []struct {
			Name  string `json:"name"`
			State string `json:"state"`
		} `json:"groups"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Groups) != 1 || out.Groups[0].Name != "OUTSIDE" || out.Groups[0].State != "MASTER" {
		t.Errorf("Groups = %+v", out.Groups)
	}
}

func TestVRRPStatus_PropagatesVyOSError(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowErrors["vrrp"] = "VRRP is not configured"

	resp := e.doJSON(t, http.MethodGet, "/api/high-availability/vrrp/status", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s, want 422", resp.StatusCode, b)
	}
}

func TestConntrackSyncStatus_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/high-availability/conntrack-sync/status", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestConntrackSyncStatus_ReturnsParsedFields(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowOutputs["conntrack-sync status"] = "\n" +
		"sync-interface        : eth1\n" +
		"failover-mechanism    : vrrp [sync-group INTERNAL]\n" +
		"last state transition : no transition yet!\n" +
		"ExpectationSync       : disabled\n"

	resp := e.doJSON(t, http.MethodGet, "/api/high-availability/conntrack-sync/status", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		SyncGroup      string `json:"syncGroup"`
		LastTransition string `json:"lastTransition"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.SyncGroup != "INTERNAL" || out.LastTransition != "no transition yet!" {
		t.Errorf("out = %+v", out)
	}
}

func TestConntrackSyncStatus_PropagatesVyOSError(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowErrors["conntrack-sync status"] = "conntrack-sync is not configured!"

	resp := e.doJSON(t, http.MethodGet, "/api/high-availability/conntrack-sync/status", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s, want 422", resp.StatusCode, b)
	}
}

func TestQosShaperStatus_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/qos/shaper-status?interface=eth0", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestQosShaperStatus_MissingInterfaceReturns400(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	resp := e.doJSON(t, http.MethodGet, "/api/qos/shaper-status", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestQosShaperStatus_ReturnsParsedClasses(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	const qosFormat = "%-9s  %-9s  %-11s  %-9s  %-7s  %-6s  %-7s  %s\n"
	table := fmt.Sprintf(qosFormat, "Class", "Type", "Bandwidth", "Max. BW", "Bytes", "Pkts", "Drops", "Queued") +
		fmt.Sprintf(qosFormat, strings.Repeat("-", 9), strings.Repeat("-", 9), strings.Repeat("-", 11), strings.Repeat("-", 9), strings.Repeat("-", 7), strings.Repeat("-", 6), strings.Repeat("-", 7), strings.Repeat("-", 8)) +
		fmt.Sprintf(qosFormat, "default", "fq-codel", "1.000 Mb", "1.000 Mb", "0  B", "0", "0", "0")
	e.fakeVyOS.ShowOutputs["qos shaper interface eth0"] = strings.Repeat("-", 80) + "\n" +
		"Interface: eth0\n" +
		"Policy Name: MY-SHAPER\n" +
		"\n" + table

	resp := e.doJSON(t, http.MethodGet, "/api/qos/shaper-status?interface=eth0", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Interface  string `json:"interface"`
		PolicyName string `json:"policyName"`
		Classes    []struct {
			Class string `json:"class"`
		} `json:"classes"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Interface != "eth0" || out.PolicyName != "MY-SHAPER" || len(out.Classes) != 1 {
		t.Errorf("out = %+v", out)
	}
}

func TestQosShaperStatus_PropagatesVyOSError(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowErrors["qos shaper interface eth0"] = "QoS is not applied to eth0!"

	resp := e.doJSON(t, http.MethodGet, "/api/qos/shaper-status?interface=eth0", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s, want 422", resp.StatusCode, b)
	}
}

func TestHealthz_NoAuthRequired(t *testing.T) {
	e := newTestEnv(t)
	resp, err := http.Get(e.server.URL + "/healthz")
	if err != nil {
		t.Fatalf("healthz: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

// TestHealthz_ReportsVersion guards the version-embedding feature end
// to end at the HTTP-response level (cmd/vyos-client's ldflags-set
// `version` var flows into Server.Version, which handleHealthz must
// surface) - see deploy/Dockerfile's VERSION build-arg.
func TestHealthz_ReportsVersion(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.Version = "1.2.3"

	resp, err := http.Get(e.server.URL + "/healthz")
	if err != nil {
		t.Fatalf("healthz: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	var out struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Version != "1.2.3" {
		t.Errorf("version = %q, want 1.2.3", out.Version)
	}
}

func TestLogout_ClearsSession(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/auth/logout", nil)
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("logout: status=%d", resp.StatusCode)
	}

	sessionResp := e.doJSON(t, http.MethodGet, "/api/auth/session", nil)
	defer func() { _ = sessionResp.Body.Close() }()
	if sessionResp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected session to be invalidated after logout, status=%d", sessionResp.StatusCode)
	}
}

// makeTestCertBase64 generates a real, self-signed X.509 certificate
// with the given validity window and returns it exactly as VyOS
// itself stores one: bare base64 DER, no PEM armor - see
// vyos.ParsePKICertificateExpiry's own doc comment for why that
// matters, and internal/vyos/pki_test.go for the identical helper
// used at that lower layer.
func makeTestCertBase64(t *testing.T, notBefore, notAfter time.Time) string {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "test-cert"},
		NotBefore:    notBefore,
		NotAfter:     notAfter,
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("CreateCertificate: %v", err)
	}
	return base64.StdEncoding.EncodeToString(der)
}

func TestPKIExpiry_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/pki/expiry", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestPKIExpiry_ReturnsNothingWhenPKIIsUnconfigured(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodGet, "/api/pki/expiry", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Certificates []any `json:"certificates"`
		CAs          []any `json:"cas"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Certificates) != 0 || len(out.CAs) != 0 {
		t.Errorf("got %+v, want both empty", out)
	}
}

func TestPKIExpiry_ParsesCertificatesAndCAs(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	certNotBefore := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	certNotAfter := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	caNotBefore := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	caNotAfter := time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)

	e.fakeVyOS.Config["pki"] = map[string]any{
		"certificate": map[string]any{
			"my-cert": map[string]any{
				"certificate": makeTestCertBase64(t, certNotBefore, certNotAfter),
			},
		},
		"ca": map[string]any{
			"my-ca": map[string]any{
				"certificate": makeTestCertBase64(t, caNotBefore, caNotAfter),
			},
		},
	}

	resp := e.doJSON(t, http.MethodGet, "/api/pki/expiry", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Certificates []struct {
			Name      string     `json:"name"`
			NotBefore *time.Time `json:"notBefore"`
			NotAfter  *time.Time `json:"notAfter"`
			Error     string     `json:"error"`
		} `json:"certificates"`
		CAs []struct {
			Name      string     `json:"name"`
			NotBefore *time.Time `json:"notBefore"`
			NotAfter  *time.Time `json:"notAfter"`
		} `json:"cas"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if len(out.Certificates) != 1 || out.Certificates[0].Name != "my-cert" {
		t.Fatalf("Certificates = %+v", out.Certificates)
	}
	if out.Certificates[0].NotBefore == nil || !out.Certificates[0].NotBefore.Equal(certNotBefore) {
		t.Errorf("Certificates[0].NotBefore = %v, want %v", out.Certificates[0].NotBefore, certNotBefore)
	}
	if out.Certificates[0].NotAfter == nil || !out.Certificates[0].NotAfter.Equal(certNotAfter) {
		t.Errorf("Certificates[0].NotAfter = %v, want %v", out.Certificates[0].NotAfter, certNotAfter)
	}

	if len(out.CAs) != 1 || out.CAs[0].Name != "my-ca" {
		t.Fatalf("CAs = %+v", out.CAs)
	}
	if out.CAs[0].NotAfter == nil || !out.CAs[0].NotAfter.Equal(caNotAfter) {
		t.Errorf("CAs[0].NotAfter = %v, want %v", out.CAs[0].NotAfter, caNotAfter)
	}
}

// TestPKIExpiry_ReportsAnErrorForACertificateNameWithNoCertificateStored
// covers this app's own "create a name, paste in the PEM later"
// pattern (see pkiTypes.ts) - a certificate entry can genuinely exist
// with no certificate value at all yet.
func TestPKIExpiry_ReportsAnErrorForACertificateNameWithNoCertificateStored(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	e.fakeVyOS.Config["pki"] = map[string]any{
		"certificate": map[string]any{
			"not-yet-uploaded": map[string]any{},
		},
	}

	resp := e.doJSON(t, http.MethodGet, "/api/pki/expiry", nil)
	defer func() { _ = resp.Body.Close() }()
	var out struct {
		Certificates []struct {
			Name  string `json:"name"`
			Error string `json:"error"`
		} `json:"certificates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Certificates) != 1 || out.Certificates[0].Name != "not-yet-uploaded" {
		t.Fatalf("Certificates = %+v", out.Certificates)
	}
	if out.Certificates[0].Error == "" {
		t.Error("expected a non-empty error for a certificate with nothing stored")
	}
}

func TestSystemImages_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodGet, "/api/system/images", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestSystemImages_ReturnsParsedList(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.ShowOutputs["system image"] = "Name                     Default boot    Running\n" +
		"-----------------------  --------------  ---------\n" +
		"2025.07.16-0020-rolling  Yes             Yes\n" +
		"1.4.1"

	resp := e.doJSON(t, http.MethodGet, "/api/system/images", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Images []struct {
			Name          string `json:"name"`
			IsDefaultBoot bool   `json:"isDefaultBoot"`
			IsRunning     bool   `json:"isRunning"`
		} `json:"images"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Images) != 2 {
		t.Fatalf("len(Images) = %d, want 2", len(out.Images))
	}
	if out.Images[0] != struct {
		Name          string `json:"name"`
		IsDefaultBoot bool   `json:"isDefaultBoot"`
		IsRunning     bool   `json:"isRunning"`
	}{Name: "2025.07.16-0020-rolling", IsDefaultBoot: true, IsRunning: true} {
		t.Errorf("Images[0] = %+v", out.Images[0])
	}
	if out.Images[1].Name != "1.4.1" || out.Images[1].IsDefaultBoot || out.Images[1].IsRunning {
		t.Errorf("Images[1] = %+v", out.Images[1])
	}
}

func TestAddSystemImage_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodPost, "/api/system/images", map[string]string{"url": "https://example.com/vyos.iso"})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestAddSystemImage_Success(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	url := "https://downloads.vyos.io/rolling/current/amd64/vyos-rolling-latest.iso"
	e.fakeVyOS.SystemImageAddOutputs[url] = "Trying to fetch ISO file...\nDone.\n"

	resp := e.doJSON(t, http.MethodPost, "/api/system/images", map[string]string{"url": url})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
	var out struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Message != "Trying to fetch ISO file...\nDone.\n" {
		t.Errorf("Message = %q", out.Message)
	}
}

// TestAddSystemImage_RejectsNonHTTPURL guards the input validation
// that stands in for VyOS's own script accepting arbitrary local
// filesystem paths too - this app only ever offers a URL field, so
// anything that isn't a plain http(s) URL is rejected rather than
// passed through unexamined.
func TestAddSystemImage_RejectsNonHTTPURL(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	cases := []string{
		"",
		"not-a-url",
		"ftp://example.com/vyos.iso",
		"file:///etc/passwd",
		"/tmp/vyos.iso",
	}
	for _, url := range cases {
		t.Run(url, func(t *testing.T) {
			resp := e.doJSON(t, http.MethodPost, "/api/system/images", map[string]string{"url": url})
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("url=%q: status = %d, want 400", url, resp.StatusCode)
			}
		})
	}
}

func TestAddSystemImage_PropagatesVyOSError(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	url := "https://example.com/bad.iso"
	e.fakeVyOS.SystemImageAddErrors[url] = "Error: not enough free disk space"

	resp := e.doJSON(t, http.MethodPost, "/api/system/images", map[string]string{"url": url})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s, want 422", resp.StatusCode, b)
	}
}

func TestDeleteSystemImage_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp := e.doJSON(t, http.MethodDelete, "/api/system/images?name=1.4.0", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestDeleteSystemImage_Success(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.SystemImageDeleteOutputs["1.4.0"] = "Deleting the \"1.4.0\" image...\nDone\n"

	resp := e.doJSON(t, http.MethodDelete, "/api/system/images?name=1.4.0", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, b)
	}
}

func TestDeleteSystemImage_RejectsInvalidName(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodDelete, "/api/system/images?name="+url.QueryEscape("../../etc/passwd"), nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestDeleteSystemImage_PropagatesVyOSError(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)
	e.fakeVyOS.SystemImageDeleteErrors["2025.07.16-0020-rolling"] = "Error: cannot delete the running image"

	resp := e.doJSON(t, http.MethodDelete, "/api/system/images?name=2025.07.16-0020-rolling", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s, want 422", resp.StatusCode, b)
	}
}
