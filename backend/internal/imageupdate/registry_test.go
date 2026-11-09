package imageupdate

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"syscall"
	"testing"
	"time"
)

func testRef(t *testing.T, apiHost string) Reference {
	t.Helper()
	return Reference{RegistryName: apiHost, APIHost: apiHost, Repository: "library/nginx", Tag: "1.25.3"}
}

// httpsTestClient builds an *http.Client that trusts every given
// httptest.NewTLSServer's self-signed certificate - each such server
// generates its own certificate, so a test exercising two of them at
// once (a registry plus a separate token-issuing realm) needs a
// client whose trust pool includes both, rather than either server's
// own single-cert Client().
func httpsTestClient(t *testing.T, servers ...*httptest.Server) *http.Client {
	t.Helper()
	pool := x509.NewCertPool()
	for _, s := range servers {
		pool.AddCert(s.Certificate())
	}
	return &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool}}}
}

func TestListTags_AnonymousNoChallenge(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/library/nginx/tags/list" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		// Regression guard: a real public image (netbirdio/netbird,
		// ~1800 tags across ~5 variants per release) was found to have
		// its newest tags truncated by too small a page size (100),
		// silently reporting "up to date" against an incomplete list -
		// see tagsPageSize's own doc comment.
		if got := r.URL.Query().Get("n"); got != "1000" {
			t.Errorf("requested page size = %q, want 1000", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"library/nginx","tags":["1.24.0","1.25.0","1.25.3"]}`))
	}))
	defer server.Close()

	c := NewClient(Config{HTTPClient: server.Client()})
	ref := testRef(t, strings.TrimPrefix(server.URL, "https://"))
	tags, err := c.ListTags(context.Background(), ref, nil, false)
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if len(tags) != 3 {
		t.Fatalf("expected 3 tags, got %+v", tags)
	}
}

func TestListTags_Pagination(t *testing.T) {
	var requests int
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Query().Get("last") == "" {
			w.Header().Set("Link", `</v2/library/nginx/tags/list?last=1.25.0&n=100>; rel="next"`)
			_, _ = w.Write([]byte(`{"name":"library/nginx","tags":["1.24.0","1.25.0"]}`))
			return
		}
		_, _ = w.Write([]byte(`{"name":"library/nginx","tags":["1.25.3"]}`))
	}))
	defer server.Close()

	c := NewClient(Config{HTTPClient: server.Client()})
	ref := testRef(t, strings.TrimPrefix(server.URL, "https://"))
	tags, err := c.ListTags(context.Background(), ref, nil, false)
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if requests != 2 {
		t.Errorf("expected 2 requests (one per page), got %d", requests)
	}
	if len(tags) != 3 {
		t.Fatalf("expected 3 tags across both pages, got %+v", tags)
	}
}

func TestListTags_ErrorsWhenPageLimitReached(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Link", `</v2/library/nginx/tags/list?last=x&n=100>; rel="next"`)
		_, _ = w.Write([]byte(`{"name":"library/nginx","tags":["1.24.0"]}`))
	}))
	defer server.Close()

	c := NewClient(Config{HTTPClient: server.Client()})
	ref := testRef(t, strings.TrimPrefix(server.URL, "https://"))
	_, err := c.ListTags(context.Background(), ref, nil, false)
	if err == nil || !strings.Contains(err.Error(), "pages") {
		t.Fatalf("expected a page-limit error, got %v", err)
	}
}

func TestListTags_ExactlyMaxPagesIsNotAnError(t *testing.T) {
	var requests int
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		if requests < maxTagPages {
			w.Header().Set("Link", `</v2/library/nginx/tags/list?last=x&n=100>; rel="next"`)
		}
		_, _ = w.Write([]byte(`{"name":"library/nginx","tags":["1.24.0"]}`))
	}))
	defer server.Close()

	c := NewClient(Config{HTTPClient: server.Client()})
	ref := testRef(t, strings.TrimPrefix(server.URL, "https://"))
	tags, err := c.ListTags(context.Background(), ref, nil, false)
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if requests != maxTagPages || len(tags) != maxTagPages {
		t.Errorf("requests = %d, tags = %d, want %d each", requests, len(tags), maxTagPages)
	}
}

func TestListTags_BearerChallenge(t *testing.T) {
	var tokenRequests int
	var tokenServer *httptest.Server
	registry := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			w.Header().Set("WWW-Authenticate", fmt.Sprintf(
				`Bearer realm="%s",service="registry.example.com",scope="repository:library/nginx:pull"`, tokenServer.URL))
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Errorf("unexpected Authorization on registry request: %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"library/nginx","tags":["1.25.3"]}`))
	}))
	defer registry.Close()

	tokenServer = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenRequests++
		if got := r.URL.Query().Get("service"); got != "registry.example.com" {
			t.Errorf("unexpected service param: %q", got)
		}
		if got := r.URL.Query().Get("scope"); got != "repository:library/nginx:pull" {
			t.Errorf("unexpected scope param: %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"token":"test-token"}`))
	}))
	defer tokenServer.Close()

	c := NewClient(Config{HTTPClient: httpsTestClient(t, registry, tokenServer)})
	ref := testRef(t, strings.TrimPrefix(registry.URL, "https://"))
	tags, err := c.ListTags(context.Background(), ref, nil, false)
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if len(tags) != 1 || tags[0] != "1.25.3" {
		t.Errorf("unexpected tags: %+v", tags)
	}
	if tokenRequests != 1 {
		t.Errorf("expected exactly 1 token request, got %d", tokenRequests)
	}
}

func TestListTags_BearerChallengeWithCredentials(t *testing.T) {
	var gotAuth string
	var registry *httptest.Server
	tokenServer := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"token":"test-token"}`))
	}))
	defer tokenServer.Close()

	registry = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			w.Header().Set("WWW-Authenticate", fmt.Sprintf(`Bearer realm="%s"`, tokenServer.URL))
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"library/nginx","tags":["1.25.3"]}`))
	}))
	defer registry.Close()

	c := NewClient(Config{HTTPClient: httpsTestClient(t, registry, tokenServer)})
	ref := testRef(t, strings.TrimPrefix(registry.URL, "https://"))
	creds := &Credentials{Username: "alice", Password: "s3cret"}
	if _, err := c.ListTags(context.Background(), ref, creds, false); err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	wantAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("alice:s3cret"))
	if gotAuth != wantAuth {
		t.Errorf("token request Authorization = %q, want %q", gotAuth, wantAuth)
	}
}

func TestListTags_BasicChallenge(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			w.Header().Set("WWW-Authenticate", `Basic realm="registry"`)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		wantAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("alice:s3cret"))
		if got := r.Header.Get("Authorization"); got != wantAuth {
			t.Errorf("unexpected Authorization: %q, want %q", got, wantAuth)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"library/nginx","tags":["1.25.3"]}`))
	}))
	defer server.Close()

	c := NewClient(Config{HTTPClient: server.Client()})
	ref := testRef(t, strings.TrimPrefix(server.URL, "https://"))
	creds := &Credentials{Username: "alice", Password: "s3cret"}
	tags, err := c.ListTags(context.Background(), ref, creds, false)
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if len(tags) != 1 {
		t.Errorf("unexpected tags: %+v", tags)
	}
}

func TestListTags_BasicChallengeWithoutCredentialsFails(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("WWW-Authenticate", `Basic realm="registry"`)
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	c := NewClient(Config{HTTPClient: server.Client()})
	ref := testRef(t, strings.TrimPrefix(server.URL, "https://"))
	if _, err := c.ListTags(context.Background(), ref, nil, false); err == nil {
		t.Error("expected an error when the registry requires Basic auth but no credentials are configured")
	}
}

func TestListTags_RegistryErrorResponse(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"errors":[{"code":"NAME_UNKNOWN"}]}`))
	}))
	defer server.Close()

	c := NewClient(Config{HTTPClient: server.Client()})
	ref := testRef(t, strings.TrimPrefix(server.URL, "https://"))
	if _, err := c.ListTags(context.Background(), ref, nil, false); err == nil {
		t.Error("expected an error for a 404 response")
	}
}

// TestListTags_InsecureFallsBackToPlainHTTP guards VyOS's `container
// registry <name> insecure` flag also covering a registry with no
// TLS at all, not just an untrusted certificate: a plain
// httptest.NewServer (no TLS listener at all) can't complete an HTTPS
// handshake, so ListTags must detect that connection-level failure
// and retry over plain http:// rather than surfacing it as an error.
// Deliberately doesn't use the HTTPClient override (that's for
// exercising the ordinary TLS-verified path against a trusted test
// certificate) - the insecure client this test exercises is Client's
// own internally-built, TLS-verification-skipping one.
func TestListTags_InsecureFallsBackToPlainHTTP(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"library/nginx","tags":["1.25.3"]}`))
	}))
	defer server.Close()

	c := NewClient(Config{})
	ref := testRef(t, strings.TrimPrefix(server.URL, "http://"))
	tags, err := c.ListTags(context.Background(), ref, nil, true)
	if err != nil {
		t.Fatalf("ListTags with insecure=true: %v", err)
	}
	if len(tags) != 1 || tags[0] != "1.25.3" {
		t.Errorf("unexpected tags: %+v", tags)
	}
}

func TestListTags_NotInsecureDoesNotFallBackToPlainHTTP(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"library/nginx","tags":["1.25.3"]}`))
	}))
	defer server.Close()

	c := NewClient(Config{})
	ref := testRef(t, strings.TrimPrefix(server.URL, "http://"))
	if _, err := c.ListTags(context.Background(), ref, nil, false); err == nil {
		t.Error("expected an error: an https request against a plain-HTTP-only server should fail when insecure=false")
	}
}

func TestTagExists_Found(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/library/nginx/manifests/1.25.3" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("Accept"); !strings.Contains(got, "application/vnd.oci.image.manifest.v1+json") {
			t.Errorf("unexpected Accept header: %q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	c := NewClient(Config{HTTPClient: server.Client()})
	ref := testRef(t, strings.TrimPrefix(server.URL, "https://"))
	exists, err := c.TagExists(context.Background(), ref, nil, false)
	if err != nil {
		t.Fatalf("TagExists: %v", err)
	}
	if !exists {
		t.Error("expected exists=true for a 200 response")
	}
}

func TestTagExists_NotFoundIsNotAnError(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	c := NewClient(Config{HTTPClient: server.Client()})
	ref := testRef(t, strings.TrimPrefix(server.URL, "https://"))
	exists, err := c.TagExists(context.Background(), ref, nil, false)
	if err != nil {
		t.Fatalf("TagExists: %v", err)
	}
	if exists {
		t.Error("expected exists=false for a 404 response")
	}
}

func TestTagExists_RegistryErrorResponse(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	c := NewClient(Config{HTTPClient: server.Client()})
	ref := testRef(t, strings.TrimPrefix(server.URL, "https://"))
	if _, err := c.TagExists(context.Background(), ref, nil, false); err == nil {
		t.Error("expected an error for a 500 response")
	}
}

func TestTagExists_HandlesBearerChallenge(t *testing.T) {
	var tokenServer *httptest.Server
	registry := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			w.Header().Set("WWW-Authenticate", fmt.Sprintf(`Bearer realm="%s",service="ghcr.io",scope="repository:library/nginx:pull"`, tokenServer.URL))
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Errorf("unexpected Authorization on manifest request: %q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer registry.Close()

	tokenServer = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"token":"test-token"}`))
	}))
	defer tokenServer.Close()

	c := NewClient(Config{HTTPClient: httpsTestClient(t, registry, tokenServer)})
	ref := testRef(t, strings.TrimPrefix(registry.URL, "https://"))
	exists, err := c.TagExists(context.Background(), ref, nil, false)
	if err != nil {
		t.Fatalf("TagExists: %v", err)
	}
	if !exists {
		t.Error("expected exists=true")
	}
}

func TestTagExists_InsecureFallsBackToPlainHTTP(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	c := NewClient(Config{})
	ref := testRef(t, strings.TrimPrefix(server.URL, "http://"))
	exists, err := c.TagExists(context.Background(), ref, nil, true)
	if err != nil {
		t.Fatalf("TagExists with insecure=true: %v", err)
	}
	if !exists {
		t.Error("expected exists=true")
	}
}

func TestListTags_AbsoluteLinkToOtherHostIsNotFollowed(t *testing.T) {
	other := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("cross-host Link was followed; Authorization = %q", r.Header.Get("Authorization"))
	}))
	defer other.Close()

	registry := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			w.Header().Set("WWW-Authenticate", `Basic realm="registry"`)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Query().Get("last") == "" {
			w.Header().Set("Link", fmt.Sprintf(`<%s/v2/library/nginx/tags/list?last=1.25.0>; rel="next"`, other.URL))
			_, _ = w.Write([]byte(`{"name":"library/nginx","tags":["1.24.0","1.25.0"]}`))
			return
		}
		_, _ = w.Write([]byte(`{"name":"library/nginx","tags":["1.25.3"]}`))
	}))
	defer registry.Close()

	c := NewClient(Config{HTTPClient: httpsTestClient(t, registry, other)})
	ref := testRef(t, strings.TrimPrefix(registry.URL, "https://"))
	creds := &Credentials{Username: "alice", Password: "s3cret"}
	tags, err := c.ListTags(context.Background(), ref, creds, false)
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if len(tags) != 3 {
		t.Errorf("expected all 3 tags fetched from the original registry, got %+v", tags)
	}
}

func TestListTags_RefusesCredentialsToPlainHTTPRealm(t *testing.T) {
	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("token request reached a plain-http realm; Authorization = %q", r.Header.Get("Authorization"))
	}))
	defer tokenServer.Close()

	registry := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("WWW-Authenticate", fmt.Sprintf(`Bearer realm="%s"`, tokenServer.URL))
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer registry.Close()

	c := NewClient(Config{HTTPClient: registry.Client()})
	ref := testRef(t, strings.TrimPrefix(registry.URL, "https://"))
	creds := &Credentials{Username: "alice", Password: "s3cret"}
	_, err := c.ListTags(context.Background(), ref, creds, false)
	if err == nil || !strings.Contains(err.Error(), "non-https token realm") {
		t.Errorf("expected a refusal to send credentials to a plain-http realm, got %v", err)
	}
}

func TestListTags_TimeoutDoesNotFallBackToPlainHTTP(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	}))
	defer server.Close()

	c := NewClient(Config{Timeout: 50 * time.Millisecond})
	ref := testRef(t, strings.TrimPrefix(server.URL, "https://"))
	_, err := c.ListTags(context.Background(), ref, nil, true)
	// A plain-http retry against this TLS server would answer 400
	// right away instead of timing out.
	if err == nil || !strings.Contains(err.Error(), "Client.Timeout") {
		t.Errorf("expected the original timeout error, got %v", err)
	}
}

func TestShouldFallBackToHTTP(t *testing.T) {
	refused := fmt.Errorf("dial: %w", syscall.ECONNREFUSED)
	notTLS := tls.RecordHeaderError{Msg: "first record does not look like a TLS handshake"}
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"initial request refused", &initialRequestError{refused}, true},
		{"initial request got plain http", &initialRequestError{notTLS}, true},
		{"initial request got an HTTP response", &initialRequestError{http.ErrSchemeMismatch}, true},
		{"initial request timed out", &initialRequestError{context.DeadlineExceeded}, false},
		{"initial request cancelled", &initialRequestError{context.Canceled}, false},
		{"refusal outside the initial request", refused, false},
		{"token step failure", fmt.Errorf("imageupdate: fetching registry token: %w", notTLS), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldFallBackToHTTP(tt.err); got != tt.want {
				t.Errorf("shouldFallBackToHTTP = %v, want %v", got, tt.want)
			}
		})
	}
}
