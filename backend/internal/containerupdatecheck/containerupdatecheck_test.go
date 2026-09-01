package containerupdatecheck_test

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/containerupdatecheck"
	"github.com/walnuss0815/vyos-client/backend/internal/imageupdate"
	"github.com/walnuss0815/vyos-client/backend/internal/notifications"
	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

func newTestVyOSClient(t *testing.T) (*vyos.Client, *testutil.FakeVyOS) {
	t.Helper()
	fake := testutil.New("test-key")
	t.Cleanup(fake.Close)
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}
	return c, fake
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// newTestRegistryServer starts a TLS test registry serving tags for
// "library/nginx" (anonymous, no auth challenge), returning both the
// server and a *imageupdate.Client already configured to trust it.
func newTestRegistryServer(t *testing.T, tags string) (*httptest.Server, *imageupdate.Client) {
	t.Helper()
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"library/nginx","tags":[` + tags + `]}`))
	}))
	t.Cleanup(server.Close)
	return server, imageupdate.NewClient(imageupdate.Config{HTTPClient: server.Client()})
}

func registryHost(server *httptest.Server) string {
	return strings.TrimPrefix(server.URL, "https://")
}

// httpsTestClient builds an *http.Client that trusts every given
// httptest.NewTLSServer's self-signed certificate - needed whenever a
// single *imageupdate.Client (as the real Checker always uses just
// one, shared across every container it checks) must reach more than
// one distinct test registry server in the same test.
func httpsTestClient(t *testing.T, servers ...*httptest.Server) *http.Client {
	t.Helper()
	pool := x509.NewCertPool()
	for _, s := range servers {
		pool.AddCert(s.Certificate())
	}
	return &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool}}}
}

func TestListContainerImages_ReturnsConfiguredContainers(t *testing.T) {
	vyosClient, fake := newTestVyOSClient(t)
	fake.Config["container"] = map[string]any{
		"name": map[string]any{
			"web": map[string]any{"image": "nginx:1.25.0"},
			"db":  map[string]any{"image": "postgres:16"},
		},
	}

	got, err := containerupdatecheck.ListContainerImages(context.Background(), vyosClient)
	if err != nil {
		t.Fatalf("ListContainerImages: %v", err)
	}
	if len(got) != 2 || got["web"] != "nginx:1.25.0" || got["db"] != "postgres:16" {
		t.Errorf("got %+v", got)
	}
}

func TestListContainerImages_EmptyWhenNoneConfigured(t *testing.T) {
	vyosClient, _ := newTestVyOSClient(t)
	got, err := containerupdatecheck.ListContainerImages(context.Background(), vyosClient)
	if err != nil {
		t.Fatalf("ListContainerImages: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("got %+v, want empty", got)
	}
}

func TestListContainerImages_SkipsEntriesWithoutAUsableImageField(t *testing.T) {
	vyosClient, fake := newTestVyOSClient(t)
	fake.Config["container"] = map[string]any{
		"name": map[string]any{
			"web":       map[string]any{"image": "nginx:1.25.0"},
			"no-image":  map[string]any{"description": "no image field at all"},
			"malformed": "not even a map",
		},
	}

	got, err := containerupdatecheck.ListContainerImages(context.Background(), vyosClient)
	if err != nil {
		t.Fatalf("ListContainerImages: %v", err)
	}
	if len(got) != 1 || got["web"] != "nginx:1.25.0" {
		t.Errorf("got %+v, want only the one well-formed entry", got)
	}
}

func TestLookupRegistryCredentials_AnonymousWhenNoEntryConfigured(t *testing.T) {
	vyosClient, _ := newTestVyOSClient(t)
	creds, insecure, err := containerupdatecheck.LookupRegistryCredentials(context.Background(), vyosClient, testLogger(), "registry.example.com")
	if err != nil {
		t.Fatalf("LookupRegistryCredentials: %v", err)
	}
	if creds != nil {
		t.Errorf("creds = %+v, want nil", creds)
	}
	if insecure {
		t.Error("insecure = true, want false")
	}
}

func TestLookupRegistryCredentials_ReturnsConfiguredCredentials(t *testing.T) {
	vyosClient, fake := newTestVyOSClient(t)
	fake.Config["container"] = map[string]any{
		"registry": map[string]any{
			"registry.example.com": map[string]any{
				"authentication": map[string]any{
					"username": "alice",
					"password": "s3cret",
				},
			},
		},
	}

	creds, insecure, err := containerupdatecheck.LookupRegistryCredentials(context.Background(), vyosClient, testLogger(), "registry.example.com")
	if err != nil {
		t.Fatalf("LookupRegistryCredentials: %v", err)
	}
	if creds == nil || creds.Username != "alice" || creds.Password != "s3cret" {
		t.Errorf("creds = %+v", creds)
	}
	if insecure {
		t.Error("insecure = true, want false")
	}
}

func TestLookupRegistryCredentials_ReportsInsecureFlag(t *testing.T) {
	vyosClient, fake := newTestVyOSClient(t)
	fake.Config["container"] = map[string]any{
		"registry": map[string]any{
			"registry.example.com": map[string]any{
				"insecure": map[string]any{},
			},
		},
	}

	_, insecure, err := containerupdatecheck.LookupRegistryCredentials(context.Background(), vyosClient, testLogger(), "registry.example.com")
	if err != nil {
		t.Fatalf("LookupRegistryCredentials: %v", err)
	}
	if !insecure {
		t.Error("insecure = false, want true")
	}
}

func newTestStore(t *testing.T) *notifications.Store {
	t.Helper()
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("notifications.NewStore: %v", err)
	}
	return s
}

func TestChecker_Run_RaisesNotificationForAvailableUpdate(t *testing.T) {
	vyosClient, fake := newTestVyOSClient(t)
	registry, registryClient := newTestRegistryServer(t, `"1.24.0","1.25.0","1.26.0"`)
	store := newTestStore(t)

	fake.Config["container"] = map[string]any{
		"name": map[string]any{
			"web": map[string]any{"image": registryHost(registry) + "/library/nginx:1.25.0"},
		},
	}

	checker := &containerupdatecheck.Checker{
		VyOS:          vyosClient,
		Registry:      registryClient,
		Notifications: store,
		Logger:        testLogger(),
	}
	checker.Run(context.Background())

	got := store.List()
	if len(got) != 1 {
		t.Fatalf("List() has %d notifications, want 1: %+v", len(got), got)
	}
	if got[0].Category != containerupdatecheck.NotificationCategory {
		t.Errorf("Category = %q, want %q", got[0].Category, containerupdatecheck.NotificationCategory)
	}
	if !strings.Contains(got[0].Title, "web") {
		t.Errorf("Title = %q, want it to mention the container name", got[0].Title)
	}
	if !strings.Contains(got[0].Message, "1.26.0") {
		t.Errorf("Message = %q, want it to mention the new tag", got[0].Message)
	}
}

func TestChecker_Run_NoNotificationWhenUpToDate(t *testing.T) {
	vyosClient, fake := newTestVyOSClient(t)
	registry, registryClient := newTestRegistryServer(t, `"1.24.0","1.25.0"`)
	store := newTestStore(t)

	fake.Config["container"] = map[string]any{
		"name": map[string]any{
			"web": map[string]any{"image": registryHost(registry) + "/library/nginx:1.25.0"},
		},
	}

	checker := &containerupdatecheck.Checker{VyOS: vyosClient, Registry: registryClient, Notifications: store, Logger: testLogger()}
	checker.Run(context.Background())

	if got := store.List(); len(got) != 0 {
		t.Errorf("List() = %+v, want empty when already up to date", got)
	}
}

func TestChecker_Run_SkipsDigestPinnedImages(t *testing.T) {
	vyosClient, fake := newTestVyOSClient(t)
	store := newTestStore(t)
	// No registry client set up - if the checker tried to contact one
	// for a digest-pinned reference, this would panic on a nil
	// pointer, failing the test.
	checker := &containerupdatecheck.Checker{VyOS: vyosClient, Registry: imageupdate.NewClient(imageupdate.Config{}), Notifications: store, Logger: testLogger()}

	fake.Config["container"] = map[string]any{
		"name": map[string]any{
			"web": map[string]any{"image": "nginx@sha256:" + strings.Repeat("a", 64)},
		},
	}

	checker.Run(context.Background())

	if got := store.List(); len(got) != 0 {
		t.Errorf("List() = %+v, want empty for a digest-pinned image", got)
	}
}

func TestChecker_Run_ContinuesAfterOneContainerFailsToParse(t *testing.T) {
	vyosClient, fake := newTestVyOSClient(t)
	registry, registryClient := newTestRegistryServer(t, `"1.24.0","1.25.0","1.26.0"`)
	store := newTestStore(t)

	fake.Config["container"] = map[string]any{
		"name": map[string]any{
			"broken": map[string]any{"image": ""}, // ListContainerImages already skips empty images
			"web":    map[string]any{"image": registryHost(registry) + "/library/nginx:1.25.0"},
		},
	}

	checker := &containerupdatecheck.Checker{VyOS: vyosClient, Registry: registryClient, Notifications: store, Logger: testLogger()}
	checker.Run(context.Background())

	got := store.List()
	if len(got) != 1 {
		t.Fatalf("List() has %d notifications, want 1 (the well-formed container should still be checked): %+v", len(got), got)
	}
}

func TestChecker_Run_RepeatedRunsDoNotDuplicateNotifications(t *testing.T) {
	vyosClient, fake := newTestVyOSClient(t)
	registry, registryClient := newTestRegistryServer(t, `"1.24.0","1.25.0","1.26.0"`)
	store := newTestStore(t)

	fake.Config["container"] = map[string]any{
		"name": map[string]any{
			"web": map[string]any{"image": registryHost(registry) + "/library/nginx:1.25.0"},
		},
	}

	checker := &containerupdatecheck.Checker{VyOS: vyosClient, Registry: registryClient, Notifications: store, Logger: testLogger()}
	checker.Run(context.Background())
	checker.Run(context.Background())
	checker.Run(context.Background())

	if got := store.List(); len(got) != 1 {
		t.Errorf("List() has %d notifications after 3 runs, want 1 (deduplicated)", len(got))
	}
}

func TestChecker_Run_ReNotifiesAfterTheEarlierNotificationWasDismissed(t *testing.T) {
	vyosClient, fake := newTestVyOSClient(t)
	registry, registryClient := newTestRegistryServer(t, `"1.24.0","1.25.0","1.26.0"`)
	store := newTestStore(t)

	fake.Config["container"] = map[string]any{
		"name": map[string]any{
			"web": map[string]any{"image": registryHost(registry) + "/library/nginx:1.25.0"},
		},
	}

	checker := &containerupdatecheck.Checker{VyOS: vyosClient, Registry: registryClient, Notifications: store, Logger: testLogger()}
	checker.Run(context.Background())

	first := store.List()
	if len(first) != 1 {
		t.Fatalf("expected 1 notification after the first run, got %d", len(first))
	}
	if _, err := store.Delete(first[0].ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	checker.Run(context.Background())
	if got := store.List(); len(got) != 1 {
		t.Errorf("List() has %d notifications after dismiss+re-run, want 1 (re-notified)", len(got))
	}
}

func TestChecker_Run_ContinuesAfterOneContainerHasARegistryError(t *testing.T) {
	vyosClient, fake := newTestVyOSClient(t)
	failingRegistry := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(failingRegistry.Close)
	workingRegistry := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"library/nginx","tags":["1.24.0","1.25.0","1.26.0"]}`))
	}))
	t.Cleanup(workingRegistry.Close)

	// One shared *imageupdate.Client, trusting both test registries'
	// certificates - matching how the real Server/Checker wiring
	// always uses a single shared registry client across every
	// container it checks.
	store := newTestStore(t)
	registryClient := imageupdate.NewClient(imageupdate.Config{HTTPClient: httpsTestClient(t, failingRegistry, workingRegistry)})

	fake.Config["container"] = map[string]any{
		"name": map[string]any{
			"broken-registry": map[string]any{"image": registryHost(failingRegistry) + "/library/nginx:1.25.0"},
			"web":             map[string]any{"image": registryHost(workingRegistry) + "/library/nginx:1.25.0"},
		},
	}

	checker := &containerupdatecheck.Checker{VyOS: vyosClient, Registry: registryClient, Notifications: store, Logger: testLogger()}
	checker.Run(context.Background())

	got := store.List()
	if len(got) != 1 {
		t.Fatalf("List() has %d notifications, want 1 (only the working registry's container)", len(got))
	}
	if !strings.Contains(got[0].Title, "web") {
		t.Errorf("Title = %q, want it to mention the working container", got[0].Title)
	}
}
