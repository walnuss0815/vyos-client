package notifications_test

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/notifications"
)

func TestAdd_AssignsIDAndCreatedAt(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	n, err := s.Add(notifications.Notification{
		// Caller-supplied ID/CreatedAt must be ignored, not honored -
		// every notification is assigned fresh values by Add.
		ID:       "should-be-overwritten",
		Severity: notifications.SeverityWarning,
		Category: "test",
		Title:    "Something happened",
		Message:  "Details here.",
	})
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	if n.ID == "" || n.ID == "should-be-overwritten" {
		t.Errorf("ID = %q, want a freshly generated one", n.ID)
	}
	if n.CreatedAt.IsZero() {
		t.Error("CreatedAt is zero, want it set to the current time")
	}
	if n.Severity != notifications.SeverityWarning || n.Category != "test" || n.Title != "Something happened" || n.Message != "Details here." {
		t.Errorf("Add did not preserve the other fields: %+v", n)
	}
}

func TestAdd_TwoNotificationsGetDistinctIDs(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	a, err := s.Add(notifications.Notification{Title: "A"})
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	b, err := s.Add(notifications.Notification{Title: "B"})
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	if a.ID == b.ID {
		t.Errorf("expected distinct IDs, got the same one twice: %q", a.ID)
	}
}

func TestList_ReturnsNewestFirst(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	first, _ := s.Add(notifications.Notification{Title: "first"})
	second, _ := s.Add(notifications.Notification{Title: "second"})
	third, _ := s.Add(notifications.Notification{Title: "third"})

	got := s.List()
	if len(got) != 3 {
		t.Fatalf("List returned %d items, want 3", len(got))
	}
	wantOrder := []string{third.ID, second.ID, first.ID}
	for i, want := range wantOrder {
		if got[i].ID != want {
			t.Errorf("item %d: ID = %q, want %q (newest-first order)", i, got[i].ID, want)
		}
	}
}

func TestList_ReturnsACopyNotTheInternalSlice(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if _, err := s.Add(notifications.Notification{Title: "only"}); err != nil {
		t.Fatalf("Add: %v", err)
	}

	got := s.List()
	got[0].Title = "mutated by the caller"

	got2 := s.List()
	if got2[0].Title != "only" {
		t.Errorf("mutating List's return value affected the store's own state: %q", got2[0].Title)
	}
}

func TestAdd_EvictsOldestOnceMaxItemsExceeded(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{MaxItems: 2})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	first, _ := s.Add(notifications.Notification{Title: "first"})
	second, _ := s.Add(notifications.Notification{Title: "second"})
	third, _ := s.Add(notifications.Notification{Title: "third"})
	_ = first

	got := s.List()
	if len(got) != 2 {
		t.Fatalf("List returned %d items, want 2 (capped at MaxItems)", len(got))
	}
	if got[0].ID != third.ID || got[1].ID != second.ID {
		t.Errorf("expected the two newest (third, second) to survive eviction, got %+v", got)
	}
}

func TestAddIfNotPresent_AddsWhenNoMatchingDedupeKeyExists(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	added, n, err := s.AddIfNotPresent("update:web:nginx:1.25", notifications.Notification{Title: "Update available"})
	if err != nil {
		t.Fatalf("AddIfNotPresent: %v", err)
	}
	if !added {
		t.Error("added = false, want true for a fresh dedupe key")
	}
	if n.ID == "" {
		t.Error("expected a freshly assigned ID")
	}
	if len(s.List()) != 1 {
		t.Errorf("List() has %d items, want 1", len(s.List()))
	}
}

func TestAddIfNotPresent_SkipsWhenTheSameDedupeKeyIsAlreadyPresent(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	first, err := s.Add(notifications.Notification{Title: "first", DedupeKey: "update:web:nginx:1.25"})
	if err != nil {
		t.Fatalf("Add: %v", err)
	}

	added, got, err := s.AddIfNotPresent("update:web:nginx:1.25", notifications.Notification{Title: "second"})
	if err != nil {
		t.Fatalf("AddIfNotPresent: %v", err)
	}
	if added {
		t.Error("added = true, want false when the dedupe key already exists")
	}
	if got.ID != first.ID {
		t.Errorf("returned notification ID = %q, want the existing entry's ID %q", got.ID, first.ID)
	}
	if len(s.List()) != 1 {
		t.Errorf("List() has %d items, want 1 (no duplicate added)", len(s.List()))
	}
}

func TestAddIfNotPresent_ReAddsAfterTheMatchingEntryWasDismissed(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	first, err := s.Add(notifications.Notification{Title: "first", DedupeKey: "update:web:nginx:1.25"})
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	if _, err := s.Delete(first.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	added, _, err := s.AddIfNotPresent("update:web:nginx:1.25", notifications.Notification{Title: "second"})
	if err != nil {
		t.Fatalf("AddIfNotPresent: %v", err)
	}
	if !added {
		t.Error("added = false, want true once the previous matching entry was dismissed")
	}
}

func TestAddIfNotPresent_EmptyDedupeKeyNeverMatches(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if _, _, err := s.AddIfNotPresent("", notifications.Notification{Title: "one"}); err != nil {
		t.Fatalf("AddIfNotPresent (1): %v", err)
	}
	added, _, err := s.AddIfNotPresent("", notifications.Notification{Title: "two"})
	if err != nil {
		t.Fatalf("AddIfNotPresent (2): %v", err)
	}
	if !added {
		t.Error("added = false, want true - an empty dedupe key should never suppress a new notification")
	}
	if len(s.List()) != 2 {
		t.Errorf("List() has %d items, want 2", len(s.List()))
	}
}

func TestMarkRead_MarksTheMatchingEntry(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	n, _ := s.Add(notifications.Notification{Title: "only"})

	found, err := s.MarkRead(n.ID)
	if err != nil {
		t.Fatalf("MarkRead: %v", err)
	}
	if !found {
		t.Error("MarkRead: found = false, want true")
	}
	if got := s.List(); !got[0].Read {
		t.Error("expected the entry to be marked read")
	}
}

func TestMarkRead_AlreadyReadIsAHarmlessNoOp(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	n, _ := s.Add(notifications.Notification{Title: "only"})
	if _, err := s.MarkRead(n.ID); err != nil {
		t.Fatalf("MarkRead (first): %v", err)
	}
	found, err := s.MarkRead(n.ID)
	if err != nil {
		t.Fatalf("MarkRead (second): %v", err)
	}
	if !found {
		t.Error("MarkRead: found = false, want true")
	}
}

func TestMarkRead_UnknownIDReportsNotFound(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	found, err := s.MarkRead("does-not-exist")
	if err != nil {
		t.Fatalf("MarkRead: %v", err)
	}
	if found {
		t.Error("MarkRead: found = true, want false")
	}
}

func TestMarkAllRead_MarksEveryEntry(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if _, err := s.Add(notifications.Notification{Title: "one"}); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if _, err := s.Add(notifications.Notification{Title: "two"}); err != nil {
		t.Fatalf("Add: %v", err)
	}

	if err := s.MarkAllRead(); err != nil {
		t.Fatalf("MarkAllRead: %v", err)
	}
	for _, n := range s.List() {
		if !n.Read {
			t.Errorf("entry %q was not marked read", n.Title)
		}
	}
}

func TestDelete_RemovesTheMatchingEntry(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	keep, _ := s.Add(notifications.Notification{Title: "keep"})
	remove, _ := s.Add(notifications.Notification{Title: "remove"})

	found, err := s.Delete(remove.ID)
	if err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if !found {
		t.Error("Delete: found = false, want true")
	}

	got := s.List()
	if len(got) != 1 || got[0].ID != keep.ID {
		t.Errorf("List after delete = %+v, want only the kept entry", got)
	}
}

func TestDelete_UnknownIDReportsNotFound(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	found, err := s.Delete("does-not-exist")
	if err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if found {
		t.Error("Delete: found = true, want false")
	}
}

func TestNewStore_WithoutDataDirDoesNotPersist(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if _, err := s.Add(notifications.Notification{Title: "ephemeral"}); err != nil {
		t.Fatalf("Add: %v", err)
	}
	// Nothing to assert against a file path here (there is none) -
	// the real assertion is simply that Add didn't error out trying
	// to persist to an empty DataDir.
}

func TestNewStore_PersistsAndReloadsAcrossInstances(t *testing.T) {
	dir := t.TempDir()

	s1, err := notifications.NewStore(notifications.Config{DataDir: dir})
	if err != nil {
		t.Fatalf("NewStore (1): %v", err)
	}
	n, err := s1.Add(notifications.Notification{Title: "persisted"})
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	if _, err := s1.MarkRead(n.ID); err != nil {
		t.Fatalf("MarkRead: %v", err)
	}

	s2, err := notifications.NewStore(notifications.Config{DataDir: dir})
	if err != nil {
		t.Fatalf("NewStore (2): %v", err)
	}
	got := s2.List()
	if len(got) != 1 || got[0].ID != n.ID || got[0].Title != "persisted" || !got[0].Read {
		t.Errorf("reloaded state = %+v, want the persisted, marked-read entry", got)
	}
}

func TestNewStore_MissingFileIsNotAnError(t *testing.T) {
	dir := t.TempDir()
	s, err := notifications.NewStore(notifications.Config{DataDir: dir})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if got := s.List(); len(got) != 0 {
		t.Errorf("List() = %+v, want empty for a fresh DataDir", got)
	}
}

func TestNewStore_CorruptFileIsAnError(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "notifications.json"), []byte("not valid json"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if _, err := notifications.NewStore(notifications.Config{DataDir: dir}); err == nil {
		t.Error("expected an error for a corrupt persisted file, got nil")
	}
}

func TestNewStore_DefaultsMaxItemsWhenUnset(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	for i := 0; i < notifications.DefaultMaxItems+5; i++ {
		if _, err := s.Add(notifications.Notification{Title: "n"}); err != nil {
			t.Fatalf("Add: %v", err)
		}
	}
	if got := len(s.List()); got != notifications.DefaultMaxItems {
		t.Errorf("List() has %d items, want capped at DefaultMaxItems (%d)", got, notifications.DefaultMaxItems)
	}
}

// TestStore_ConcurrentUseIsRace_Free guards Store's own documented
// "safe for concurrent use" claim - run with -race in CI.
func TestStore_ConcurrentUseIsRaceFree(t *testing.T) {
	s, err := notifications.NewStore(notifications.Config{MaxItems: 50})
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			n, err := s.Add(notifications.Notification{Title: "concurrent"})
			if err != nil {
				t.Errorf("Add: %v", err)
				return
			}
			_, _ = s.MarkRead(n.ID)
			_ = s.List()
		}()
	}
	wg.Wait()
}
