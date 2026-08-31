// Package ingress implements the Ingress feature: an authenticated
// reverse proxy (see Proxy) that lets a logged-in user reach a web UI
// on the router's own network through this app, without opening a
// separate port for it - together with the small amount of state
// (name, target URL, custom request headers) needed to know what to
// proxy where.
//
// This is the one deliberate exception to internal/config's "no
// config file, no database" principle (see that package's own doc
// comment): unlike every other setting, ingress definitions are
// themselves managed at runtime through the UI rather than fixed once
// at container start, so they need a small amount of durable storage
// that isn't the environment. A single JSON file, persisted to a
// mounted volume, is deliberately the simplest thing that could work
// for what's expected to be a handful of entries per deployment - not
// a database. See docs/architecture.md's "Ingress" section.
package ingress

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
)

// Header is a single request header injected into every proxied
// request for an Entry - e.g. a static bearer token or API key an
// upstream app expects, so the operator doesn't have to (or can't,
// for some black-box embedded web UIs) configure that separately in
// the upstream app itself.
type Header struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// Entry is one configured ingress: a friendly name (used in its proxy
// path and the sidebar), the upstream URL it proxies to, and any
// request headers to inject.
type Entry struct {
	// Name identifies this entry in the UI and in its proxy path
	// (/ingress/<name>/...). Must match namePattern. Immutable after
	// creation - Store.Update cannot change it, same tagNode-rename
	// restriction VyOS itself effectively has (delete and re-create
	// instead).
	Name string `json:"name"`
	// Description is an optional operator-facing note, shown in the
	// management UI only.
	Description string `json:"description,omitempty"`
	// TargetURL is the upstream base URL this entry proxies to, e.g.
	// "http://10.0.0.5:8080". Must be an absolute http(s) URL with a
	// host. Any path on it is kept as a prefix ahead of whatever the
	// browser requests past the ingress name - see Proxy.
	TargetURL string `json:"targetUrl"`
	// Headers are injected into every proxied request, overriding any
	// header of the same name the browser sent. Typically used for
	// upstream authentication (e.g. a static API key or bearer
	// token) the operator doesn't want to expose in, or can't
	// configure via, the upstream app's own UI.
	Headers []Header `json:"headers,omitempty"`
	// SkipTLSVerify disables TLS certificate verification when
	// TargetURL is https:// - for upstream apps using a self-signed
	// certificate. Same opt-in pattern as
	// config.Config.VyOSAPIInsecureSkipVerify.
	SkipTLSVerify bool `json:"skipTlsVerify,omitempty"`
}

// namePattern bounds Entry.Name to a URL-path-safe charset with no
// case-collision hazard, since it's interpolated directly into the
// proxy path (/ingress/<name>/...) and the frontend's sidebar link.
var namePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

// maxNameLength keeps Name comfortably within typical URL-path-segment
// and DNS-label conventions - there's no technical requirement for
// this exact number, just a sanity bound against a pathological input.
const maxNameLength = 63

// MaxHeaders bounds how many headers a single entry can carry -
// defense-in-depth against an unbounded request-building loop, same
// reasoning as other list-length caps in this codebase.
const MaxHeaders = 32

// fileName is the JSON file Store persists entries to, inside the
// configured data directory.
const fileName = "ingress.json"

// Store persists Entry definitions to a single JSON file and serves
// them from an in-memory cache kept in sync on every mutation - reads
// (on every proxied request) never touch disk.
type Store struct {
	path string

	mu      sync.RWMutex
	entries map[string]Entry
}

// NewStore opens (or initializes) a Store backed by
// <dataDir>/ingress.json. dataDir is created if it doesn't exist yet
// (the common case for a freshly-mounted, empty volume); any other
// error here means the volume is missing entirely or not writable,
// which is deliberately surfaced as a hard startup failure rather than
// only being discovered on the first attempt to save an ingress entry
// - see docs/configuration-reference.md's INGRESS_DATA_DIR entry for
// the required container volume mount.
func NewStore(dataDir string) (*Store, error) {
	if dataDir == "" {
		return nil, fmt.Errorf("ingress: data directory is required")
	}
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, fmt.Errorf("ingress: creating data directory %q (is it a writable mounted volume?): %w", dataDir, err)
	}
	s := &Store{path: filepath.Join(dataDir, fileName)}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) load() error {
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		s.entries = map[string]Entry{}
		return nil
	}
	if err != nil {
		return fmt.Errorf("ingress: reading %s: %w", s.path, err)
	}
	var list []Entry
	if err := json.Unmarshal(data, &list); err != nil {
		return fmt.Errorf("ingress: %s is malformed: %w", s.path, err)
	}
	entries := make(map[string]Entry, len(list))
	for _, e := range list {
		entries[e.Name] = e
	}
	s.entries = entries
	return nil
}

// List returns every configured entry, sorted by name for stable
// output.
func (s *Store) List() []Entry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Entry, 0, len(s.entries))
	for _, e := range s.entries {
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// Get returns the entry named name, or ok=false if none exists.
func (s *Store) Get(name string) (e Entry, ok bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	e, ok = s.entries[name]
	return e, ok
}

// ErrNotFound is returned by Update/Delete when name doesn't exist.
var ErrNotFound = errors.New("ingress: not found")

// ErrAlreadyExists is returned by Create when name is already taken.
var ErrAlreadyExists = errors.New("ingress: already exists")

// Create validates and adds a new entry, persisting the store to disk
// before returning. The in-memory entries are rolled back if the
// persist fails, so a failed write never leaves the in-memory cache
// and the on-disk file disagreeing with each other.
func (s *Store) Create(e Entry) (Entry, error) {
	if err := Validate(e); err != nil {
		return Entry{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.entries[e.Name]; exists {
		return Entry{}, fmt.Errorf("%w: %q", ErrAlreadyExists, e.Name)
	}
	s.entries[e.Name] = e
	if err := s.persistLocked(); err != nil {
		delete(s.entries, e.Name)
		return Entry{}, err
	}
	return e, nil
}

// Update validates and replaces an existing entry by name, persisting
// the store to disk before returning. The in-memory entries are
// rolled back if the persist fails.
func (s *Store) Update(e Entry) (Entry, error) {
	if err := Validate(e); err != nil {
		return Entry{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	previous, exists := s.entries[e.Name]
	if !exists {
		return Entry{}, fmt.Errorf("%w: %q", ErrNotFound, e.Name)
	}
	s.entries[e.Name] = e
	if err := s.persistLocked(); err != nil {
		s.entries[e.Name] = previous
		return Entry{}, err
	}
	return e, nil
}

// Delete removes an entry by name, persisting the store to disk
// before returning. The in-memory entries are rolled back if the
// persist fails.
func (s *Store) Delete(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	previous, exists := s.entries[name]
	if !exists {
		return fmt.Errorf("%w: %q", ErrNotFound, name)
	}
	delete(s.entries, name)
	if err := s.persistLocked(); err != nil {
		s.entries[name] = previous
		return err
	}
	return nil
}

// persistLocked writes every entry to disk atomically - write to a
// temp file in the same directory, fsync it, then rename over the
// real path - so a crash or power loss mid-write can never leave a
// truncated or half-written ingress.json behind; the rename is the
// only step that can be observed to complete. Caller must hold s.mu.
func (s *Store) persistLocked() error {
	list := make([]Entry, 0, len(s.entries))
	for _, e := range s.entries {
		list = append(list, e)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Name < list[j].Name })

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return fmt.Errorf("ingress: encoding entries: %w", err)
	}

	dir := filepath.Dir(s.path)
	tmp, err := os.CreateTemp(dir, ".ingress-*.json.tmp")
	if err != nil {
		return fmt.Errorf("ingress: creating temp file in %s: %w", dir, err)
	}
	tmpPath := tmp.Name()
	defer func() { _ = os.Remove(tmpPath) }() // no-op once the rename below succeeds

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("ingress: writing %s: %w", tmpPath, err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("ingress: syncing %s: %w", tmpPath, err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("ingress: closing %s: %w", tmpPath, err)
	}
	if err := os.Chmod(tmpPath, 0o600); err != nil {
		return fmt.Errorf("ingress: setting permissions on %s: %w", tmpPath, err)
	}
	if err := os.Rename(tmpPath, s.path); err != nil {
		return fmt.Errorf("ingress: replacing %s: %w", s.path, err)
	}
	return nil
}

// Validate checks the structural validity of an entry (name charset,
// target URL, header count/shape) before it's ever persisted or
// proxied to - same "catch a typo at the boundary, not as an opaque
// runtime failure" reasoning as config.Load's validation. Exported so
// internal/api's handlers can validate a request body before doing
// any header-value resolution against a previous entry (see
// docs/architecture.md's "Ingress" section for why that resolution
// step exists).
func Validate(e Entry) error {
	if e.Name == "" {
		return fmt.Errorf("ingress: name is required")
	}
	if len(e.Name) > maxNameLength {
		return fmt.Errorf("ingress: name %q is too long (max %d characters)", e.Name, maxNameLength)
	}
	if !namePattern.MatchString(e.Name) {
		return fmt.Errorf(
			"ingress: name %q is invalid (must be lowercase letters, digits, and \"-\", starting with a letter or digit)",
			e.Name,
		)
	}

	u, err := url.Parse(e.TargetURL)
	if err != nil {
		return fmt.Errorf("ingress: target URL is not a valid URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("ingress: target URL must start with http:// or https://, got %q", e.TargetURL)
	}
	if u.Host == "" {
		return fmt.Errorf("ingress: target URL is missing a host, got %q", e.TargetURL)
	}

	if len(e.Headers) > MaxHeaders {
		return fmt.Errorf("ingress: too many headers (%d), maximum is %d", len(e.Headers), MaxHeaders)
	}
	seen := make(map[string]struct{}, len(e.Headers))
	for _, h := range e.Headers {
		if h.Name == "" {
			return fmt.Errorf("ingress: a header name is empty")
		}
		if h.Value == "" {
			return fmt.Errorf("ingress: header %q has an empty value", h.Name)
		}
		key := strings.ToLower(h.Name)
		if _, dup := seen[key]; dup {
			return fmt.Errorf("ingress: duplicate header %q", h.Name)
		}
		seen[key] = struct{}{}
	}
	return nil
}
