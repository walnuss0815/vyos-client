package ingress_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/ingress"
)

func TestNewStore_CreatesMissingDataDir(t *testing.T) {
	base := t.TempDir()
	dataDir := filepath.Join(base, "nested", "data")

	if _, err := os.Stat(dataDir); !os.IsNotExist(err) {
		t.Fatalf("expected %s not to exist yet", dataDir)
	}

	store, err := ingress.NewStore(dataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if store.List() == nil {
		t.Error("expected List() to return a non-nil (if empty) slice for a freshly-created store")
	}
	if len(store.List()) != 0 {
		t.Errorf("expected an empty store, got %d entries", len(store.List()))
	}
	if info, err := os.Stat(dataDir); err != nil || !info.IsDir() {
		t.Errorf("expected %s to have been created as a directory: %v", dataDir, err)
	}
}

func TestNewStore_RejectsUnwritableDataDir(t *testing.T) {
	base := t.TempDir()
	readOnlyParent := filepath.Join(base, "readonly")
	if err := os.Mkdir(readOnlyParent, 0o500); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(readOnlyParent, 0o700) }) // let TempDir cleanup remove it

	_, err := ingress.NewStore(filepath.Join(readOnlyParent, "data"))
	if err == nil {
		t.Fatal("expected an error creating a data dir under a read-only parent")
	}
}

func TestNewStore_RequiresDataDir(t *testing.T) {
	if _, err := ingress.NewStore(""); err == nil {
		t.Fatal("expected an error for an empty data directory")
	}
}

func TestStore_CreateGetListDelete(t *testing.T) {
	store, err := ingress.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	entry := ingress.Entry{
		Name:      "nas",
		TargetURL: "http://10.0.0.5:8080",
		Headers:   []ingress.Header{{Name: "Authorization", Value: "Bearer secret"}},
	}
	created, err := store.Create(entry)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.Name != "nas" {
		t.Errorf("created.Name = %q, want nas", created.Name)
	}

	got, ok := store.Get("nas")
	if !ok {
		t.Fatal("expected Get to find the created entry")
	}
	if got.TargetURL != "http://10.0.0.5:8080" {
		t.Errorf("TargetURL = %q, want http://10.0.0.5:8080", got.TargetURL)
	}
	if len(got.Headers) != 1 || got.Headers[0].Value != "Bearer secret" {
		t.Errorf("unexpected headers: %+v", got.Headers)
	}

	list := store.List()
	if len(list) != 1 || list[0].Name != "nas" {
		t.Errorf("List() = %+v, want a single nas entry", list)
	}

	if err := store.Delete("nas"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, ok := store.Get("nas"); ok {
		t.Error("expected the entry to be gone after Delete")
	}
}

func TestStore_ListSortedByName(t *testing.T) {
	store, err := ingress.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	for _, name := range []string{"zebra", "alpha", "middle"} {
		if _, err := store.Create(ingress.Entry{Name: name, TargetURL: "http://10.0.0.1"}); err != nil {
			t.Fatalf("Create(%s): %v", name, err)
		}
	}
	list := store.List()
	if len(list) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(list))
	}
	want := []string{"alpha", "middle", "zebra"}
	for i, name := range want {
		if list[i].Name != name {
			t.Errorf("list[%d].Name = %q, want %q (list not sorted: %+v)", i, list[i].Name, name, list)
		}
	}
}

func TestStore_CreateRejectsDuplicateName(t *testing.T) {
	store, err := ingress.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if _, err := store.Create(ingress.Entry{Name: "nas", TargetURL: "http://10.0.0.5"}); err != nil {
		t.Fatalf("Create: %v", err)
	}
	_, err = store.Create(ingress.Entry{Name: "nas", TargetURL: "http://10.0.0.6"})
	if !errors.Is(err, ingress.ErrAlreadyExists) {
		t.Errorf("Create with a duplicate name: got %v, want ErrAlreadyExists", err)
	}
}

func TestStore_UpdateReplacesAndPersists(t *testing.T) {
	dataDir := t.TempDir()
	store, err := ingress.NewStore(dataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if _, err := store.Create(ingress.Entry{Name: "nas", TargetURL: "http://10.0.0.5"}); err != nil {
		t.Fatalf("Create: %v", err)
	}

	updated, err := store.Update(ingress.Entry{Name: "nas", TargetURL: "http://10.0.0.6", Description: "new"})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.TargetURL != "http://10.0.0.6" {
		t.Errorf("TargetURL = %q, want http://10.0.0.6", updated.TargetURL)
	}

	// Re-open a fresh Store over the same data dir to confirm the
	// update actually reached disk, not just the in-memory cache.
	reopened, err := ingress.NewStore(dataDir)
	if err != nil {
		t.Fatalf("NewStore (reopen): %v", err)
	}
	got, ok := reopened.Get("nas")
	if !ok {
		t.Fatal("expected the entry to survive a reopen")
	}
	if got.TargetURL != "http://10.0.0.6" || got.Description != "new" {
		t.Errorf("reopened entry = %+v, want the updated values", got)
	}
}

func TestStore_UpdateUnknownNameFails(t *testing.T) {
	store, err := ingress.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	_, err = store.Update(ingress.Entry{Name: "ghost", TargetURL: "http://10.0.0.5"})
	if !errors.Is(err, ingress.ErrNotFound) {
		t.Errorf("Update of an unknown name: got %v, want ErrNotFound", err)
	}
}

func TestStore_DeleteUnknownNameFails(t *testing.T) {
	store, err := ingress.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	err = store.Delete("ghost")
	if !errors.Is(err, ingress.ErrNotFound) {
		t.Errorf("Delete of an unknown name: got %v, want ErrNotFound", err)
	}
}

func TestStore_CreateRollsBackOnPersistFailure(t *testing.T) {
	dataDir := t.TempDir()
	store, err := ingress.NewStore(dataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if _, err := store.Create(ingress.Entry{Name: "nas", TargetURL: "http://10.0.0.5"}); err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Make the data directory read-only so the next persist (temp
	// file creation) fails, then confirm the in-memory cache rolled
	// back rather than diverging from what's actually on disk.
	if err := os.Chmod(dataDir, 0o500); err != nil {
		t.Fatalf("Chmod: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(dataDir, 0o700) })

	_, err = store.Create(ingress.Entry{Name: "switch", TargetURL: "http://10.0.0.6"})
	if err == nil {
		t.Fatal("expected Create to fail when the data directory is read-only")
	}
	if _, ok := store.Get("switch"); ok {
		t.Error("expected the failed entry to have been rolled back from the in-memory cache")
	}
}

func TestNewStore_LoadsExistingFile(t *testing.T) {
	dataDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dataDir, "ingress.json"), []byte(`[
		{"name": "nas", "targetUrl": "http://10.0.0.5:8080", "headers": [{"name": "X-Api-Key", "value": "abc123"}]}
	]`), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	store, err := ingress.NewStore(dataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	got, ok := store.Get("nas")
	if !ok {
		t.Fatal("expected the pre-existing entry to be loaded")
	}
	if got.TargetURL != "http://10.0.0.5:8080" {
		t.Errorf("TargetURL = %q, want http://10.0.0.5:8080", got.TargetURL)
	}
}

// TestNewStore_LoadsDocumentedExampleFile guards
// deploy/ingress.json.example against drifting out of sync with the
// real Entry/Header schema (see docs/architecture.md's "ingress.json
// format" section, which points readers at this file) - if either
// side changes shape without the other, this fails instead of only
// being discovered when an operator copies the example and it's
// rejected at startup.
func TestNewStore_LoadsDocumentedExampleFile(t *testing.T) {
	example, err := os.ReadFile("../../../deploy/ingress.json.example")
	if err != nil {
		t.Fatalf("reading deploy/ingress.json.example: %v", err)
	}

	dataDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dataDir, "ingress.json"), example, 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	store, err := ingress.NewStore(dataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	list := store.List()
	if len(list) != 2 {
		t.Fatalf("expected 2 entries from the example file, got %d: %+v", len(list), list)
	}
	if list[0].Name != "nas" || list[1].Name != "switch" {
		t.Errorf("unexpected entry names: %+v", list)
	}
	for _, e := range list {
		if err := ingress.Validate(e); err != nil {
			t.Errorf("example entry %q fails validation: %v", e.Name, err)
		}
	}
}

func TestNewStore_RejectsMalformedFile(t *testing.T) {
	dataDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dataDir, "ingress.json"), []byte("not json"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if _, err := ingress.NewStore(dataDir); err == nil {
		t.Fatal("expected an error for a malformed ingress.json")
	}
}

func TestValidate(t *testing.T) {
	cases := []struct {
		name    string
		entry   ingress.Entry
		wantErr bool
	}{
		{"valid", ingress.Entry{Name: "nas", TargetURL: "http://10.0.0.5"}, false},
		{"valid https", ingress.Entry{Name: "nas", TargetURL: "https://10.0.0.5:8443"}, false},
		{"valid with headers", ingress.Entry{
			Name: "nas", TargetURL: "http://10.0.0.5",
			Headers: []ingress.Header{{Name: "Authorization", Value: "Bearer x"}},
		}, false},
		{"empty name", ingress.Entry{Name: "", TargetURL: "http://10.0.0.5"}, true},
		{"uppercase name", ingress.Entry{Name: "NAS", TargetURL: "http://10.0.0.5"}, true},
		{"name with space", ingress.Entry{Name: "my nas", TargetURL: "http://10.0.0.5"}, true},
		{"name starting with hyphen", ingress.Entry{Name: "-nas", TargetURL: "http://10.0.0.5"}, true},
		{"name too long", ingress.Entry{Name: string(make([]byte, 64)), TargetURL: "http://10.0.0.5"}, true},
		{"missing scheme", ingress.Entry{Name: "nas", TargetURL: "10.0.0.5"}, true},
		{"unsupported scheme", ingress.Entry{Name: "nas", TargetURL: "ftp://10.0.0.5"}, true},
		{"missing host", ingress.Entry{Name: "nas", TargetURL: "http://"}, true},
		{"not a URL at all", ingress.Entry{Name: "nas", TargetURL: "::not a url::"}, true},
		{"empty header name", ingress.Entry{
			Name: "nas", TargetURL: "http://10.0.0.5",
			Headers: []ingress.Header{{Name: "", Value: "x"}},
		}, true},
		{"empty header value", ingress.Entry{
			Name: "nas", TargetURL: "http://10.0.0.5",
			Headers: []ingress.Header{{Name: "X-Foo", Value: ""}},
		}, true},
		{"duplicate header name (case-insensitive)", ingress.Entry{
			Name: "nas", TargetURL: "http://10.0.0.5",
			Headers: []ingress.Header{{Name: "X-Foo", Value: "a"}, {Name: "x-foo", Value: "b"}},
		}, true},
		{"too many headers", ingress.Entry{
			Name: "nas", TargetURL: "http://10.0.0.5",
			Headers: manyHeaders(ingress.MaxHeaders + 1),
		}, true},
		{"exactly the header limit", ingress.Entry{
			Name: "nas", TargetURL: "http://10.0.0.5",
			Headers: manyHeaders(ingress.MaxHeaders),
		}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ingress.Validate(tc.entry)
			if tc.wantErr && err == nil {
				t.Error("expected an error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Errorf("expected no error, got %v", err)
			}
		})
	}
}

func manyHeaders(n int) []ingress.Header {
	out := make([]ingress.Header, n)
	for i := range out {
		out[i] = ingress.Header{Name: string(rune('A'+i%26)) + string(rune(i/26)), Value: "x"}
	}
	return out
}
