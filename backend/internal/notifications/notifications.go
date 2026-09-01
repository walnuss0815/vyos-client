// Package notifications implements an in-app notification feed - a
// small, capped list of {severity, category, title, message} entries
// that other parts of the backend can raise (e.g. Feature 7's
// background container-image-update checker) and the frontend polls
// and lets a user mark read/dismiss.
//
// Deliberately NOT VyOS state: unlike everything else this backend
// deals with, a notification describes something *this app* noticed
// (or was told), not something read from `/retrieve` or `/show`. It
// therefore needs somewhere of its own to live - see Store's own doc
// comment for how that's kept optional, matching this project's
// "no separate server-side state management" principle as closely as
// a genuinely stateful feature can.
package notifications

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/walnuss0815/vyos-client/backend/internal/atomicfile"
)

// Severity is a notification's importance, surfaced to the frontend
// for styling (e.g. an icon/color) - purely presentational, never
// used to filter or sort server-side.
type Severity string

const (
	SeverityInfo    Severity = "info"
	SeverityWarning Severity = "warning"
	SeverityError   Severity = "error"
)

// Notification is a single entry in the feed.
type Notification struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	Severity  Severity  `json:"severity"`
	// Category loosely groups notifications by source (e.g.
	// "container-image-update") - free-form, not an enum, so a future
	// producer never needs to touch this package to add a new one.
	Category string `json:"category"`
	Title    string `json:"title"`
	Message  string `json:"message"`
	Read     bool   `json:"read"`
	// DedupeKey, if set, identifies the specific still-unresolved
	// condition this notification is about (e.g. "container image
	// update available for web: nginx:1.24 -> nginx:1.25") - see
	// AddIfNotPresent. Not meaningful to the frontend (it has no use
	// for it), but persisted like every other field so a producer
	// that runs repeatedly across restarts (e.g. a scheduled
	// background check) can still recognize its own past entries
	// after one.
	DedupeKey string `json:"dedupeKey,omitempty"`
}

// fileName is the persisted notifications file's name within
// Store's data directory - see Config.DataDir.
const fileName = "notifications.json"

// DefaultMaxItems is the retention cap applied when Config.MaxItems is
// left at its zero value. Chosen as a generous-but-bounded number for
// a feed nobody is expected to page through - old, already-read
// entries are simply the first to be evicted once the cap is hit (see
// Store.Add).
const DefaultMaxItems = 200

// Config configures a new Store.
type Config struct {
	// DataDir, if set, is a directory Store persists its state to
	// (as "<DataDir>/notifications.json") so the feed survives a
	// restart. Left unset, Store is purely in-memory: it still works
	// for as long as the process runs, but starts back at empty on
	// every restart - the same "degrades gracefully without
	// persistence" behavior SessionSecret has always had, extended to
	// this feature too (see cmd/vyos-client/sessionsecret.go, which
	// shares this same DataDir).
	DataDir string
	// MaxItems caps how many notifications are retained at once,
	// oldest evicted first. Zero (the typical case - callers normally
	// leave this unset) means DefaultMaxItems.
	MaxItems int
}

// Store holds the current notification feed in memory, optionally
// persisting every mutation to DataDir so it survives a restart.
// Safe for concurrent use.
type Store struct {
	mu       sync.Mutex
	items    []Notification // ordered newest-first
	dataDir  string
	maxItems int
}

// NewStore constructs a Store per cfg, loading any existing persisted
// state from cfg.DataDir if one is configured. A missing file (the
// common case - first run, or persistence just enabled) is not an
// error; a present-but-corrupt or unreadable file is, since silently
// discarding it would be a surprising way to lose a user's read/
// dismissed state.
func NewStore(cfg Config) (*Store, error) {
	maxItems := cfg.MaxItems
	if maxItems <= 0 {
		maxItems = DefaultMaxItems
	}
	s := &Store{dataDir: cfg.DataDir, maxItems: maxItems}
	if cfg.DataDir == "" {
		return s, nil
	}

	data, err := os.ReadFile(s.path())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return s, nil
		}
		return nil, fmt.Errorf("notifications: reading %q: %w", s.path(), err)
	}
	var items []Notification
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, fmt.Errorf("notifications: parsing %q: %w", s.path(), err)
	}
	s.items = items
	return s, nil
}

func (s *Store) path() string {
	return filepath.Join(s.dataDir, fileName)
}

// Add records a new notification and returns it with its ID and
// CreatedAt filled in (any caller-supplied values for either are
// ignored - every notification is assigned a fresh ID and timestamp
// here, so producers never need their own ID scheme). Newest entries
// are kept at the front of List's result; once the store holds
// maxItems entries, the oldest is evicted to make room, regardless of
// its read state - a notification nobody read yet can still age out,
// same trade-off a fixed-size ring buffer always makes, preferred here
// over unbounded growth for a feature nothing else in this codebase
// has ever needed to cap.
func (s *Store) Add(n Notification) (Notification, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.addLocked(n)
}

// AddIfNotPresent behaves like Add, except it first checks whether a
// notification with the same dedupeKey already exists anywhere in the
// current feed - if one does, that existing notification is returned
// unchanged and added reports false, rather than piling up another
// entry for the same still-unresolved condition. Intended for a
// producer that runs repeatedly (e.g. a scheduled background check):
// calling this every time it finds the same issue still present is
// safe and idempotent, rather than needing its own separate
// "have I already reported this" bookkeeping.
//
// Dismissing (Delete) a notification removes its DedupeKey from
// consideration too - deliberately: dismiss means "I saw this," not
// "never tell me about this again," so if the same condition is still
// true the next time this runs, a fresh notification is added. A
// dedupeKey of "" never matches anything (every call with one adds a
// new notification, same as Add) - producers that don't need
// deduplication can simply not use this method at all.
func (s *Store) AddIfNotPresent(dedupeKey string, n Notification) (added bool, result Notification, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if dedupeKey != "" {
		for _, existing := range s.items {
			if existing.DedupeKey == dedupeKey {
				return false, existing, nil
			}
		}
	}
	n.DedupeKey = dedupeKey
	result, err = s.addLocked(n)
	return err == nil, result, err
}

// addLocked is Add/AddIfNotPresent's shared implementation. s.mu must
// already be held by the caller.
func (s *Store) addLocked(n Notification) (Notification, error) {
	id, err := newID()
	if err != nil {
		return Notification{}, fmt.Errorf("notifications: generating id: %w", err)
	}
	n.ID = id
	n.CreatedAt = time.Now()

	s.items = append([]Notification{n}, s.items...)
	if len(s.items) > s.maxItems {
		s.items = s.items[:s.maxItems]
	}
	if err := s.persistLocked(); err != nil {
		return Notification{}, err
	}
	return n, nil
}

// List returns every current notification, newest first. The returned
// slice is a copy - safe to read without holding any lock, and safe
// against a caller mutating it back into Store's own state.
func (s *Store) List() []Notification {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Notification, len(s.items))
	copy(out, s.items)
	return out
}

// MarkRead sets id's Read flag to true, persisting the change. Reports
// whether id was found; marking an already-read notification read
// again is a harmless no-op that still reports found=true.
func (s *Store) MarkRead(id string) (found bool, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.items {
		if s.items[i].ID != id {
			continue
		}
		if s.items[i].Read {
			return true, nil
		}
		s.items[i].Read = true
		if err := s.persistLocked(); err != nil {
			return false, err
		}
		return true, nil
	}
	return false, nil
}

// MarkAllRead sets every notification's Read flag to true, persisting
// the change once for the whole batch (not once per item).
func (s *Store) MarkAllRead() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	changed := false
	for i := range s.items {
		if !s.items[i].Read {
			s.items[i].Read = true
			changed = true
		}
	}
	if !changed {
		return nil
	}
	return s.persistLocked()
}

// Delete removes id from the store, persisting the change. Reports
// whether id was found.
func (s *Store) Delete(id string) (found bool, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.items {
		if s.items[i].ID != id {
			continue
		}
		s.items = append(s.items[:i], s.items[i+1:]...)
		if err := s.persistLocked(); err != nil {
			return false, err
		}
		return true, nil
	}
	return false, nil
}

// persistLocked writes the current item list to disk if a DataDir was
// configured; a no-op otherwise (the purely-in-memory mode). Callers
// must already hold s.mu.
func (s *Store) persistLocked() error {
	if s.dataDir == "" {
		return nil
	}
	data, err := json.Marshal(s.items)
	if err != nil {
		return fmt.Errorf("notifications: encoding: %w", err)
	}
	if err := atomicfile.Write(s.path(), data, 0o600); err != nil {
		return fmt.Errorf("notifications: persisting %q: %w", s.path(), err)
	}
	return nil
}

// newID returns a random, URL-safe identifier for a new notification -
// collision-resistant enough that this package doesn't need to check
// for (or handle) an accidental duplicate.
func newID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
