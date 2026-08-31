package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/selfupgrade"
)

// selfUpgradeStatusOut mirrors selfUpgradeStatusResponse's JSON shape
// (unexported in package api), decoding only the fields these tests
// assert on.
type selfUpgradeStatusOut struct {
	Enabled                  bool   `json:"enabled"`
	ContainerName            string `json:"containerName"`
	ImageRepo                string `json:"imageRepo"`
	CurrentVersion           string `json:"currentVersion"`
	LatestVersion            string `json:"latestVersion"`
	CurrentVersionRecognized bool   `json:"currentVersionRecognized"`
	UpdateAvailable          bool   `json:"updateAvailable"`
	Releases                 []struct {
		Version string `json:"version"`
		Name    string `json:"name"`
		Body    string `json:"body"`
		HTMLURL string `json:"htmlUrl"`
	} `json:"releases"`
}

func newTestGitHubReleasesServer(t *testing.T, body string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)
	return server
}

func TestSelfUpgradeStatus_DisabledByDefault(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodGet, "/api/system/self-upgrade", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var out selfUpgradeStatusOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Enabled {
		t.Error("expected enabled=false when Server.SelfUpgradeEnabled is unset")
	}
	if out.CurrentVersion != "" || out.ContainerName != "" || len(out.Releases) != 0 {
		t.Errorf("expected every other field to be zero when disabled, got %+v", out)
	}
}

func TestSelfUpgradeStatus_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	// No login - the request should be rejected before even reaching
	// the handler, same as every other authenticated endpoint.
	resp, err := http.Get(e.server.URL + "/api/system/self-upgrade")
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestSelfUpgradeStatus_UpdateAvailable(t *testing.T) {
	github := newTestGitHubReleasesServer(t, `[
		{"tag_name": "v2.0.0", "name": "2.0.0", "body": "big release", "draft": false, "prerelease": false, "published_at": "2026-02-01T00:00:00Z", "html_url": "https://example.com/2.0.0"},
		{"tag_name": "v1.5.0", "name": "1.5.0", "body": "smaller release", "draft": false, "prerelease": false, "published_at": "2026-01-15T00:00:00Z", "html_url": "https://example.com/1.5.0"},
		{"tag_name": "v1.0.0", "name": "1.0.0", "body": "original", "draft": false, "prerelease": false, "published_at": "2026-01-01T00:00:00Z", "html_url": "https://example.com/1.0.0"}
	]`)
	ghClient, err := selfupgrade.New(selfupgrade.Config{Repo: "example/repo", BaseURL: github.URL, HTTPClient: github.Client()})
	if err != nil {
		t.Fatalf("selfupgrade.New: %v", err)
	}

	e := newTestEnv(t)
	e.apiServer.SelfUpgradeEnabled = true
	e.apiServer.SelfUpgradeContainerName = "vyos-client"
	e.apiServer.SelfUpgradeGitHub = ghClient
	e.apiServer.Version = "1.0.0"
	e.login(t)

	resp := e.doJSON(t, http.MethodGet, "/api/system/self-upgrade", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var out selfUpgradeStatusOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !out.Enabled {
		t.Fatal("expected enabled=true")
	}
	if out.ContainerName != "vyos-client" {
		t.Errorf("containerName = %q, want vyos-client", out.ContainerName)
	}
	if out.ImageRepo != "ghcr.io/example/repo" {
		t.Errorf("imageRepo = %q, want ghcr.io/example/repo", out.ImageRepo)
	}
	if out.CurrentVersion != "1.0.0" {
		t.Errorf("currentVersion = %q, want 1.0.0", out.CurrentVersion)
	}
	if out.LatestVersion != "2.0.0" {
		t.Errorf("latestVersion = %q, want 2.0.0", out.LatestVersion)
	}
	if !out.CurrentVersionRecognized {
		t.Error("expected currentVersionRecognized=true for a real version")
	}
	if !out.UpdateAvailable {
		t.Error("expected updateAvailable=true")
	}
	if len(out.Releases) != 2 {
		t.Fatalf("expected 2 releases newer than 1.0.0, got %d: %+v", len(out.Releases), out.Releases)
	}
	if out.Releases[0].Version != "2.0.0" || out.Releases[1].Version != "1.5.0" {
		t.Errorf("unexpected release order/content: %+v", out.Releases)
	}
}

func TestSelfUpgradeStatus_UpToDate(t *testing.T) {
	github := newTestGitHubReleasesServer(t, `[
		{"tag_name": "v1.0.0", "name": "1.0.0", "body": "original", "draft": false, "prerelease": false, "published_at": "2026-01-01T00:00:00Z", "html_url": "https://example.com/1.0.0"}
	]`)
	ghClient, err := selfupgrade.New(selfupgrade.Config{Repo: "example/repo", BaseURL: github.URL, HTTPClient: github.Client()})
	if err != nil {
		t.Fatalf("selfupgrade.New: %v", err)
	}

	e := newTestEnv(t)
	e.apiServer.SelfUpgradeEnabled = true
	e.apiServer.SelfUpgradeContainerName = "vyos-client"
	e.apiServer.SelfUpgradeGitHub = ghClient
	e.apiServer.Version = "1.0.0"
	e.login(t)

	resp := e.doJSON(t, http.MethodGet, "/api/system/self-upgrade", nil)
	defer func() { _ = resp.Body.Close() }()

	var out selfUpgradeStatusOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !out.CurrentVersionRecognized {
		t.Error("expected currentVersionRecognized=true for a real version")
	}
	if out.UpdateAvailable {
		t.Error("expected updateAvailable=false when already on the latest version")
	}
	if len(out.Releases) != 0 {
		t.Errorf("expected no releases listed, got %+v", out.Releases)
	}
	if out.LatestVersion != "1.0.0" {
		t.Errorf("latestVersion = %q, want 1.0.0", out.LatestVersion)
	}
}

// TestSelfUpgradeStatus_UnparseableCurrentVersion guards local/
// non-release builds (Version="dev", cmd/vyos-client/main.go's
// default): no update comparison is possible, but the endpoint must
// still succeed rather than error.
func TestSelfUpgradeStatus_UnparseableCurrentVersion(t *testing.T) {
	github := newTestGitHubReleasesServer(t, `[
		{"tag_name": "v1.0.0", "name": "1.0.0", "body": "", "draft": false, "prerelease": false, "published_at": "2026-01-01T00:00:00Z", "html_url": "https://example.com/1.0.0"}
	]`)
	ghClient, err := selfupgrade.New(selfupgrade.Config{Repo: "example/repo", BaseURL: github.URL, HTTPClient: github.Client()})
	if err != nil {
		t.Fatalf("selfupgrade.New: %v", err)
	}

	e := newTestEnv(t)
	e.apiServer.SelfUpgradeEnabled = true
	e.apiServer.SelfUpgradeContainerName = "vyos-client"
	e.apiServer.SelfUpgradeGitHub = ghClient
	e.apiServer.Version = "dev"
	e.login(t)

	resp := e.doJSON(t, http.MethodGet, "/api/system/self-upgrade", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var out selfUpgradeStatusOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.CurrentVersionRecognized {
		t.Error("expected currentVersionRecognized=false for a \"dev\" build")
	}
	if out.UpdateAvailable {
		t.Error("expected updateAvailable=false when the current version can't be parsed")
	}
	if len(out.Releases) != 0 {
		t.Errorf("expected no releases listed, got %+v", out.Releases)
	}
	// LatestVersion should still be reported even though comparison
	// against "dev" isn't possible - it's useful context regardless.
	if out.LatestVersion != "1.0.0" {
		t.Errorf("latestVersion = %q, want 1.0.0", out.LatestVersion)
	}
}

func TestSelfUpgradeStatus_GitHubErrorReturnsBadGateway(t *testing.T) {
	github := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"message": "API rate limit exceeded"}`))
	}))
	t.Cleanup(github.Close)
	ghClient, err := selfupgrade.New(selfupgrade.Config{Repo: "example/repo", BaseURL: github.URL, HTTPClient: github.Client()})
	if err != nil {
		t.Fatalf("selfupgrade.New: %v", err)
	}

	e := newTestEnv(t)
	e.apiServer.SelfUpgradeEnabled = true
	e.apiServer.SelfUpgradeContainerName = "vyos-client"
	e.apiServer.SelfUpgradeGitHub = ghClient
	e.apiServer.Version = "1.0.0"
	e.login(t)

	resp := e.doJSON(t, http.MethodGet, "/api/system/self-upgrade", nil)
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", resp.StatusCode)
	}
}
