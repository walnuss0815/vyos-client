package auth

import (
	"sync"
	"time"
)

// RequestLimiter throttles a set of expensive, already-authenticated
// operations (see cmd/vyos-client/serve.go's wiring of one around
// config commit/commit-confirm/import) to a fixed number of requests
// per rolling window, per key - typically the authenticated username,
// since these routes only exist behind auth.RequireSession. Unlike
// LoginLimiter, there's no exponential backoff here, just a flat cap:
// the goal is bounding a runaway script or a compromised session's
// ability to hammer VyOS's own commit process (a comparatively
// expensive operation VyOS itself has no rate limit on), not slowing
// down credential brute-forcing.
//
// In-memory, ephemeral runtime state (reset on restart) - same "no
// server-side state" principle as LoginLimiter.
type RequestLimiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time

	// Max is how many requests a single key may make within Window.
	Max int
	// Window is the rolling duration Max is measured over.
	Window time.Duration
	// MaxTrackedKeys bounds how many distinct keys this limiter
	// tracks before opportunistically sweeping out fully-expired ones
	// - same reasoning as LoginLimiter.MaxTrackedSources, though in
	// practice the key space here (authenticated usernames) is far
	// smaller and more stable than login's (arbitrary source IPs).
	MaxTrackedKeys int
}

// NewRequestLimiter constructs a RequestLimiter allowing at most max
// requests per key within a rolling window.
func NewRequestLimiter(max int, window time.Duration) *RequestLimiter {
	return &RequestLimiter{
		hits:           map[string][]time.Time{},
		Max:            max,
		Window:         window,
		MaxTrackedKeys: 10_000,
	}
}

// Allow reports whether a request for key is currently permitted
// under the rolling window, and if so, records it against key's
// quota. Unlike LoginLimiter's Allow/RecordFailure split, whether a
// request happened and whether it counts against the limit are the
// same question here - there's no separate "success doesn't count"
// case to model.
func (l *RequestLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-l.Window)

	if len(l.hits) >= l.MaxTrackedKeys {
		l.evictExpiredLocked(cutoff)
	}

	kept := filterAfter(l.hits[key], cutoff)
	if len(kept) >= l.Max {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	return true
}

// filterAfter returns the subset of times strictly after cutoff,
// compacted in place (safe: the write index never runs ahead of the
// read index, a standard in-place-filter pattern) since the caller
// always immediately stores the result back under the same map key.
func filterAfter(times []time.Time, cutoff time.Time) []time.Time {
	out := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			out = append(out, t)
		}
	}
	return out
}

// evictExpiredLocked removes every tracked key with no hits left
// after cutoff. l.mu must already be held by the caller.
func (l *RequestLimiter) evictExpiredLocked(cutoff time.Time) {
	for key, times := range l.hits {
		kept := filterAfter(times, cutoff)
		if len(kept) == 0 {
			delete(l.hits, key)
		} else {
			l.hits[key] = kept
		}
	}
}

// TrackedKeyCount reports how many distinct keys this limiter
// currently holds state for. Mainly useful for tests.
func (l *RequestLimiter) TrackedKeyCount() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.hits)
}
