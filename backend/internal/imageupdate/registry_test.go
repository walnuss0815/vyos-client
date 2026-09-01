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
	"testing"
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
