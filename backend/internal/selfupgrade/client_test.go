package selfupgrade

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

func TestNew_RequiresRepo(t *testing.T) {
	if _, err := New(Config{}); err == nil {
		t.Fatal("expected an error when Repo is empty")
	}
}

func TestListReleases_FetchesAndFiltersAndSorts(t *testing.T) {
	var requestCount int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		if got := r.Header.Get("User-Agent"); got == "" {
			t.Errorf("expected a User-Agent header, got none")
		}
		if r.URL.Path != "/repos/example/repo/releases" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[
			{"tag_name": "v1.0.0", "name": "1.0.0", "body": "first", "draft": false, "prerelease": false, "published_at": "2026-01-01T00:00:00Z", "html_url": "https://example.com/1.0.0"},
			{"tag_name": "v1.5.0-rc.1", "name": "1.5.0-rc.1", "body": "prerelease", "draft": false, "prerelease": true, "published_at": "2026-02-01T00:00:00Z", "html_url": "https://example.com/1.5.0-rc.1"},
			{"tag_name": "v1.2.0", "name": "1.2.0", "body": "second", "draft": false, "prerelease": false, "published_at": "2026-01-15T00:00:00Z", "html_url": "https://example.com/1.2.0"},
			{"tag_name": "v2.0.0-draft", "name": "draft release", "body": "wip", "draft": true, "prerelease": false, "published_at": "2026-03-01T00:00:00Z", "html_url": "https://example.com/2.0.0-draft"}
		]`))
	}))
	defer server.Close()

	client, err := New(Config{Repo: "example/repo", BaseURL: server.URL, HTTPClient: server.Client()})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	releases, err := client.ListReleases(context.Background())
	if err != nil {
		t.Fatalf("ListReleases: %v", err)
	}

	// Prerelease and draft entries must be excluded, leaving only
	// v1.0.0 and v1.2.0, newest (by semver) first.
	if len(releases) != 2 {
		t.Fatalf("expected 2 releases, got %d: %+v", len(releases), releases)
	}
	if releases[0].Version != "1.2.0" || releases[1].Version != "1.0.0" {
		t.Errorf("unexpected order/content: %+v", releases)
	}
	if releases[0].HTMLURL != "https://example.com/1.2.0" {
		t.Errorf("unexpected HTMLURL: %s", releases[0].HTMLURL)
	}

	if requestCount != 1 {
		t.Fatalf("expected exactly 1 HTTP request, got %d", requestCount)
	}

	// A second call within the cache TTL must not hit the server again.
	if _, err := client.ListReleases(context.Background()); err != nil {
		t.Fatalf("ListReleases (cached): %v", err)
	}
	if requestCount != 1 {
		t.Errorf("expected the cached result to be reused, got %d requests", requestCount)
	}
}

func TestListReleases_CacheExpires(t *testing.T) {
	var requestCount int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()

	client, err := New(Config{
		Repo:       "example/repo",
		BaseURL:    server.URL,
		HTTPClient: server.Client(),
		CacheTTL:   1 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if _, err := client.ListReleases(context.Background()); err != nil {
		t.Fatalf("ListReleases: %v", err)
	}
	time.Sleep(5 * time.Millisecond)
	if _, err := client.ListReleases(context.Background()); err != nil {
		t.Fatalf("ListReleases: %v", err)
	}

	if requestCount != 2 {
		t.Errorf("expected the expired cache to trigger a second request, got %d", requestCount)
	}
}

// TestListReleases_NonOKStatusTruncatesOnRuneBoundary guards against
// splitting a multi-byte UTF-8 character in the truncated error
// message - GitHub error bodies can legitimately contain non-ASCII
// (e.g. an echoed value), and a naive byte-slice truncation could cut
// one in half, producing an invalid UTF-8 string.
func TestListReleases_NonOKStatusTruncatesOnRuneBoundary(t *testing.T) {
	// 300 multi-byte characters ("é", 2 bytes each = 600 bytes),
	// comfortably past the 500-byte truncation limit at a point that
	// would land mid-rune with a naive byte-slice cut.
	body := strings.Repeat("é", 300)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(body))
	}))
	defer server.Close()

	client, err := New(Config{Repo: "example/repo", BaseURL: server.URL, HTTPClient: server.Client()})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	_, err = client.ListReleases(context.Background())
	if err == nil {
		t.Fatal("expected an error for a non-200 response")
	}
	if !utf8.ValidString(err.Error()) {
		t.Errorf("error message is not valid UTF-8: %q", err.Error())
	}
}

func TestListReleases_NonOKStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"message": "API rate limit exceeded"}`))
	}))
	defer server.Close()

	client, err := New(Config{Repo: "example/repo", BaseURL: server.URL, HTTPClient: server.Client()})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if _, err := client.ListReleases(context.Background()); err == nil {
		t.Fatal("expected an error for a non-200 response")
	}
}

func TestListReleases_MalformedJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`not json`))
	}))
	defer server.Close()

	client, err := New(Config{Repo: "example/repo", BaseURL: server.URL, HTTPClient: server.Client()})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if _, err := client.ListReleases(context.Background()); err == nil {
		t.Fatal("expected an error for a malformed response")
	}
}

// TestListReleases_ServesStaleCacheOnError guards against turning a
// transient GitHub outage/rate-limit into a worse user-facing failure
// than necessary: once a successful result has been cached at all, a
// later failed refresh should fall back to serving that stale result
// rather than propagating the error.
func TestListReleases_ServesStaleCacheOnError(t *testing.T) {
	var failing bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if failing {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"message": "API rate limit exceeded"}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"tag_name": "v1.0.0", "name": "1.0.0", "draft": false, "prerelease": false}]`))
	}))
	defer server.Close()

	client, err := New(Config{
		Repo:       "example/repo",
		BaseURL:    server.URL,
		HTTPClient: server.Client(),
		CacheTTL:   1 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	releases, err := client.ListReleases(context.Background())
	if err != nil {
		t.Fatalf("ListReleases (first, successful): %v", err)
	}
	if len(releases) != 1 || releases[0].Version != "1.0.0" {
		t.Fatalf("unexpected first result: %+v", releases)
	}

	// Let the cache expire, then make every subsequent request fail.
	time.Sleep(5 * time.Millisecond)
	failing = true

	staleReleases, err := client.ListReleases(context.Background())
	if err != nil {
		t.Fatalf("expected the stale cache to be served without an error, got: %v", err)
	}
	if len(staleReleases) != 1 || staleReleases[0].Version != "1.0.0" {
		t.Errorf("expected the stale cached result to be returned, got: %+v", staleReleases)
	}
}

// TestListReleases_NegativeCacheAvoidsRepeatedRequests guards against
// hammering (and further prolonging) a rate limit/outage: when there
// is no previous successful result to fall back to, a failed fetch
// should be remembered for NegativeCacheTTL rather than retried on
// every call.
func TestListReleases_NegativeCacheAvoidsRepeatedRequests(t *testing.T) {
	var requestCount int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"message": "API rate limit exceeded"}`))
	}))
	defer server.Close()

	client, err := New(Config{
		Repo:             "example/repo",
		BaseURL:          server.URL,
		HTTPClient:       server.Client(),
		NegativeCacheTTL: 1 * time.Hour,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if _, err := client.ListReleases(context.Background()); err == nil {
		t.Fatal("expected an error for the first, failing request")
	}
	if requestCount != 1 {
		t.Fatalf("expected exactly 1 HTTP request, got %d", requestCount)
	}

	// A second call within NegativeCacheTTL must not hit the server
	// again - it should return the same remembered error immediately.
	if _, err := client.ListReleases(context.Background()); err == nil {
		t.Fatal("expected the remembered error to be returned")
	}
	if requestCount != 1 {
		t.Errorf("expected the negative cache to suppress a second request, got %d requests", requestCount)
	}
}

// TestListReleases_NegativeCacheExpires guards the other half of
// TestListReleases_NegativeCacheAvoidsRepeatedRequests: once
// NegativeCacheTTL elapses, the next call must actually retry rather
// than being suppressed forever.
func TestListReleases_NegativeCacheExpires(t *testing.T) {
	var requestCount int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"message": "API rate limit exceeded"}`))
	}))
	defer server.Close()

	client, err := New(Config{
		Repo:             "example/repo",
		BaseURL:          server.URL,
		HTTPClient:       server.Client(),
		NegativeCacheTTL: 1 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if _, err := client.ListReleases(context.Background()); err == nil {
		t.Fatal("expected an error for the first, failing request")
	}
	time.Sleep(5 * time.Millisecond)
	if _, err := client.ListReleases(context.Background()); err == nil {
		t.Fatal("expected an error for the second, failing request")
	}

	if requestCount != 2 {
		t.Errorf("expected the expired negative cache to trigger a second request, got %d", requestCount)
	}
}

// TestListReleases_SortsParseableVersionsBeforeUnparseable guards the
// sort comparator's tie-breaking tier: a release with an unparseable
// tag must never outrank a parseable one, even if it happens to have
// a newer publish date, since mixing the two comparison strategies
// (semver vs. publish date) without that explicit tier wouldn't be a
// strict weak ordering.
func TestListReleases_SortsParseableVersionsBeforeUnparseable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[
			{"tag_name": "not-a-version", "name": "junk", "body": "", "draft": false, "prerelease": false, "published_at": "2026-06-01T00:00:00Z", "html_url": "https://example.com/junk"},
			{"tag_name": "v1.0.0", "name": "1.0.0", "body": "", "draft": false, "prerelease": false, "published_at": "2026-01-01T00:00:00Z", "html_url": "https://example.com/1.0.0"}
		]`))
	}))
	defer server.Close()

	client, err := New(Config{Repo: "example/repo", BaseURL: server.URL, HTTPClient: server.Client()})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	releases, err := client.ListReleases(context.Background())
	if err != nil {
		t.Fatalf("ListReleases: %v", err)
	}
	if len(releases) != 2 {
		t.Fatalf("expected 2 releases, got %d", len(releases))
	}
	if releases[0].Version != "1.0.0" {
		t.Errorf("expected the parseable v1.0.0 release first despite its older publish date, got %+v", releases[0])
	}
	if releases[1].Tag != "not-a-version" {
		t.Errorf("expected the unparseable release last, got %+v", releases[1])
	}
}

// TestListReleases_FollowsPagination guards fetchReleases's
// Link:...rel="next" pagination following - without it, a repo with
// more than 100 releases would silently never show anything past the
// first page (or, worse for this app's purposes, could omit the
// actual latest release if GitHub ever returned pages oldest-first
// for some reason).
func TestListReleases_FollowsPagination(t *testing.T) {
	var requestedPaths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestedPaths = append(requestedPaths, r.URL.String())
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Query().Get("page") == "2" {
			_, _ = w.Write([]byte(`[
				{"tag_name": "v1.0.0", "name": "1.0.0", "body": "", "draft": false, "prerelease": false, "published_at": "2026-01-01T00:00:00Z", "html_url": "https://example.com/1.0.0"}
			]`))
			return
		}
		nextURL := fmt.Sprintf("http://%s/repos/example/repo/releases?per_page=100&page=2", r.Host)
		w.Header().Set("Link", fmt.Sprintf(`<%s>; rel="next", <%s>; rel="last"`, nextURL, nextURL))
		_, _ = w.Write([]byte(`[
			{"tag_name": "v2.0.0", "name": "2.0.0", "body": "", "draft": false, "prerelease": false, "published_at": "2026-02-01T00:00:00Z", "html_url": "https://example.com/2.0.0"}
		]`))
	}))
	defer server.Close()

	client, err := New(Config{Repo: "example/repo", BaseURL: server.URL, HTTPClient: server.Client()})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	releases, err := client.ListReleases(context.Background())
	if err != nil {
		t.Fatalf("ListReleases: %v", err)
	}
	if len(requestedPaths) != 2 {
		t.Fatalf("expected 2 requests (one per page), got %d: %v", len(requestedPaths), requestedPaths)
	}
	if len(releases) != 2 {
		t.Fatalf("expected releases from both pages, got %d: %+v", len(releases), releases)
	}
	versions := []string{releases[0].Version, releases[1].Version}
	if versions[0] != "2.0.0" || versions[1] != "1.0.0" {
		t.Errorf("expected [2.0.0, 1.0.0] sorted newest-first across pages, got %v", versions)
	}
}

// TestListReleases_PaginationBounded guards maxPages: even if GitHub
// (or a misbehaving/malicious proxy in front of it) keeps returning a
// "next" link forever, fetchReleases must stop after a bounded number
// of pages rather than looping indefinitely.
func TestListReleases_PaginationBounded(t *testing.T) {
	var requestCount int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		nextURL := fmt.Sprintf("http://%s/repos/example/repo/releases?per_page=100&page=%d", r.Host, requestCount+1)
		w.Header().Set("Link", fmt.Sprintf(`<%s>; rel="next"`, nextURL))
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `[
			{"tag_name": "v1.0.%d", "name": "", "body": "", "draft": false, "prerelease": false, "published_at": "2026-01-01T00:00:00Z", "html_url": ""}
		]`, requestCount)
	}))
	defer server.Close()

	client, err := New(Config{Repo: "example/repo", BaseURL: server.URL, HTTPClient: server.Client()})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if _, err := client.ListReleases(context.Background()); err != nil {
		t.Fatalf("ListReleases: %v", err)
	}
	if requestCount != maxPages {
		t.Errorf("expected pagination to stop after maxPages=%d requests, got %d", maxPages, requestCount)
	}
}
