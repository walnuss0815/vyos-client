package api_test

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/imageupdate"
)

type checkContainerImageUpdateOut struct {
	Enabled         bool   `json:"enabled"`
	CurrentTag      string `json:"currentTag"`
	Recognized      bool   `json:"recognized"`
	LatestTag       string `json:"latestTag"`
	UpdateAvailable bool   `json:"updateAvailable"`
	NewImageRef     string `json:"newImageRef"`
}

// newTestRegistryServer starts a TLS test registry serving tags for
// "library/nginx" (anonymous, no auth challenge) and wires
// e.apiServer.ImageRegistry to trust its certificate.
func newTestRegistryServer(t *testing.T, e *testEnv, tags string) *httptest.Server {
	t.Helper()
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"library/nginx","tags":[` + tags + `]}`))
	}))
	t.Cleanup(server.Close)
	e.apiServer.ImageRegistry = imageupdate.NewClient(imageupdate.Config{HTTPClient: server.Client()})
	return server
}

func registryHost(server *httptest.Server) string {
	return strings.TrimPrefix(server.URL, "https://")
}

func TestCheckContainerImageUpdate_DisabledByDefault(t *testing.T) {
	e := newTestEnv(t)
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/container/images/check-update", map[string]string{"image": "nginx:1.25.3"})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var out checkContainerImageUpdateOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Enabled {
		t.Error("expected enabled=false when Server.ContainerUpdateChecksEnabled is unset")
	}
	if out.CurrentTag != "" || out.LatestTag != "" || out.UpdateAvailable {
		t.Errorf("expected every other field to be zero when disabled, got %+v", out)
	}
}

func TestCheckContainerImageUpdate_RequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	resp, err := http.Post(e.server.URL+"/api/container/images/check-update", "application/json", strings.NewReader(`{"image":"nginx:1.25.3"}`))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}

func TestCheckContainerImageUpdate_InvalidImageName(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.ContainerUpdateChecksEnabled = true
	e.login(t)

	resp := e.doJSON(t, http.MethodPost, "/api/container/images/check-update", map[string]string{"image": "not a valid image; rm -rf"})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestCheckContainerImageUpdate_UpdateAvailable(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.ContainerUpdateChecksEnabled = true
	registry := newTestRegistryServer(t, e, `"1.24.0","1.25.0","1.25.3","1.26.0"`)
	e.login(t)

	image := registryHost(registry) + "/library/nginx:1.25.0"
	resp := e.doJSON(t, http.MethodPost, "/api/container/images/check-update", map[string]string{"image": image})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var out checkContainerImageUpdateOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !out.Enabled {
		t.Fatal("expected enabled=true")
	}
	if !out.Recognized {
		t.Error("expected recognized=true for a plain semver tag")
	}
	if !out.UpdateAvailable {
		t.Error("expected updateAvailable=true")
	}
	if out.LatestTag != "1.26.0" {
		t.Errorf("latestTag = %q, want 1.26.0", out.LatestTag)
	}
	wantRef := registryHost(registry) + "/library/nginx:1.26.0"
	if out.NewImageRef != wantRef {
		t.Errorf("newImageRef = %q, want %q", out.NewImageRef, wantRef)
	}
}

func TestCheckContainerImageUpdate_UpToDate(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.ContainerUpdateChecksEnabled = true
	registry := newTestRegistryServer(t, e, `"1.25.0","1.24.0"`)
	e.login(t)

	image := registryHost(registry) + "/library/nginx:1.25.0"
	resp := e.doJSON(t, http.MethodPost, "/api/container/images/check-update", map[string]string{"image": image})
	defer func() { _ = resp.Body.Close() }()

	var out checkContainerImageUpdateOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !out.Recognized {
		t.Error("expected recognized=true")
	}
	if out.UpdateAvailable {
		t.Error("expected updateAvailable=false when already on the newest matching tag")
	}
	if out.LatestTag != "" {
		t.Errorf("expected empty latestTag, got %q", out.LatestTag)
	}
}

func TestCheckContainerImageUpdate_UnrecognizedTag(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.ContainerUpdateChecksEnabled = true
	registry := newTestRegistryServer(t, e, `"1.25.0","1.26.0"`)
	e.login(t)

	image := registryHost(registry) + "/library/nginx:latest"
	resp := e.doJSON(t, http.MethodPost, "/api/container/images/check-update", map[string]string{"image": image})
	defer func() { _ = resp.Body.Close() }()

	var out checkContainerImageUpdateOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Recognized {
		t.Error("expected recognized=false for the \"latest\" tag")
	}
	if out.UpdateAvailable {
		t.Error("expected updateAvailable=false when the tag isn't recognized")
	}
}

func TestCheckContainerImageUpdate_DigestPinnedReferenceSkipsRegistryCall(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.ContainerUpdateChecksEnabled = true
	// No ImageRegistry configured at all - if the handler tried to
	// contact a registry for a digest-pinned reference, this would
	// panic on a nil pointer, failing the test.
	e.login(t)

	image := "nginx@sha256:" + strings.Repeat("a", 64)
	resp := e.doJSON(t, http.MethodPost, "/api/container/images/check-update", map[string]string{"image": image})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var out checkContainerImageUpdateOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Recognized || out.UpdateAvailable {
		t.Errorf("expected no comparison for a digest-pinned reference, got %+v", out)
	}
}

func TestCheckContainerImageUpdate_UsesRegistryCredentials(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.ContainerUpdateChecksEnabled = true

	var gotAuth string
	registry := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			w.Header().Set("WWW-Authenticate", `Basic realm="registry"`)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"library/nginx","tags":["1.25.0","1.26.0"]}`))
	}))
	t.Cleanup(registry.Close)
	e.apiServer.ImageRegistry = imageupdate.NewClient(imageupdate.Config{HTTPClient: registry.Client()})

	host := registryHost(registry)
	e.fakeVyOS.Config["container"] = map[string]any{
		"registry": map[string]any{
			host: map[string]any{
				"authentication": map[string]any{
					"username": "alice",
					"password": "s3cret",
				},
			},
		},
	}

	e.login(t)
	image := host + "/library/nginx:1.25.0"
	resp := e.doJSON(t, http.MethodPost, "/api/container/images/check-update", map[string]string{"image": image})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	wantAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("alice:s3cret"))
	if gotAuth != wantAuth {
		t.Errorf("registry request Authorization = %q, want %q", gotAuth, wantAuth)
	}

	var out checkContainerImageUpdateOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !out.UpdateAvailable || out.LatestTag != "1.26.0" {
		t.Errorf("unexpected result: %+v", out)
	}
}

func TestCheckContainerImageUpdate_NoRegistryEntryIsAnonymous(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.ContainerUpdateChecksEnabled = true
	registry := newTestRegistryServer(t, e, `"1.25.0"`)
	e.login(t)

	// No `container registry <host>` entry seeded at all - the
	// request should still succeed anonymously.
	image := registryHost(registry) + "/library/nginx:1.24.0"
	resp := e.doJSON(t, http.MethodPost, "/api/container/images/check-update", map[string]string{"image": image})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
}

func TestCheckContainerImageUpdate_RegistryErrorReturnsBadGateway(t *testing.T) {
	e := newTestEnv(t)
	e.apiServer.ContainerUpdateChecksEnabled = true
	registry := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(registry.Close)
	e.apiServer.ImageRegistry = imageupdate.NewClient(imageupdate.Config{HTTPClient: registry.Client()})
	e.login(t)

	image := registryHost(registry) + "/library/nginx:1.25.0"
	resp := e.doJSON(t, http.MethodPost, "/api/container/images/check-update", map[string]string{"image": image})
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", resp.StatusCode)
	}
}
