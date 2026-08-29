package auth

import (
	"sync"
	"time"
)

// LoginLimiter throttles login attempts per source key (typically
// client IP) with exponential backoff, to slow down brute-forcing of
// the shared UI credential. This is in-memory, ephemeral runtime state
// (reset on restart) — not configuration, and not persisted, consistent
// with the app's "no server-side state" principle for actual VyOS
// config.
type LoginLimiter struct {
	mu       sync.Mutex
	attempts map[string]*attemptState

	// MaxAttempts before backoff kicks in.
	MaxAttempts int
	// BaseDelay is the initial backoff after MaxAttempts is exceeded;
	// it doubles on every subsequent failure up to MaxDelay.
	BaseDelay time.Duration
	MaxDelay  time.Duration
	// Window is how long of inactivity resets a source's attempt
	// count entirely.
	Window time.Duration
	// MaxTrackedSources bounds how many distinct source keys this
	// limiter tracks before opportunistically sweeping out stale
	// entries - see RecordFailure. Without this, a source key that
	// fails once (or a few times) and never returns - background
	// internet scanning/credential-stuffing hitting this UI's login
	// endpoint from a constantly-changing set of source IPs is the
	// realistic case for an internet-facing router - would sit in the
	// attempts map forever: Allow/RecordSuccess only ever clean up a
	// key when *that* key is looked up again, which never happens for
	// a one-off attacker that moves on to the next target.
	MaxTrackedSources int
}

type attemptState struct {
	failures    int
	lastAttempt time.Time
	blockedTill time.Time
}

// NewLoginLimiter constructs a LoginLimiter with sensible defaults:
// 5 free attempts, then exponential backoff starting at 1s up to 5m,
// with a 15 minute inactivity window before a source's history resets,
// and up to 10,000 distinct source keys tracked before old ones start
// being swept out.
func NewLoginLimiter() *LoginLimiter {
	return &LoginLimiter{
		attempts:          map[string]*attemptState{},
		MaxAttempts:       5,
		BaseDelay:         1 * time.Second,
		MaxDelay:          5 * time.Minute,
		Window:            15 * time.Minute,
		MaxTrackedSources: 10_000,
	}
}

// Allow reports whether a login attempt from key is currently permitted,
// and if not, how long the caller should wait.
func (l *LoginLimiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	s, ok := l.attempts[key]
	if !ok {
		return true, 0
	}
	if time.Since(s.lastAttempt) > l.Window {
		delete(l.attempts, key)
		return true, 0
	}
	if wait := time.Until(s.blockedTill); wait > 0 {
		return false, wait
	}
	return true, 0
}

// RecordFailure registers a failed login attempt from key and updates
// its backoff state.
func (l *LoginLimiter) RecordFailure(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	// Sweep before growing the map further, not after: this is the
	// only method that ever adds a new key, so checking here (rather
	// than in a separate background goroutine/ticker, which would
	// need its own lifecycle management) guarantees the map can never
	// grow past MaxTrackedSources plus whatever's still genuinely
	// active for longer than one sweep.
	if len(l.attempts) >= l.MaxTrackedSources {
		l.evictExpiredLocked()
	}

	s, ok := l.attempts[key]
	if !ok || time.Since(s.lastAttempt) > l.Window {
		s = &attemptState{}
		l.attempts[key] = s
	}
	s.failures++
	s.lastAttempt = time.Now()

	if s.failures >= l.MaxAttempts {
		delay := l.BaseDelay << uint(s.failures-l.MaxAttempts)
		if delay > l.MaxDelay || delay <= 0 {
			delay = l.MaxDelay
		}
		s.blockedTill = time.Now().Add(delay)
	}
}

// RecordSuccess clears key's failure history after a successful login.
func (l *LoginLimiter) RecordSuccess(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}

// evictExpiredLocked removes every tracked source whose Window has
// elapsed since its last attempt. l.mu must already be held by the
// caller.
func (l *LoginLimiter) evictExpiredLocked() {
	now := time.Now()
	for key, s := range l.attempts {
		if now.Sub(s.lastAttempt) > l.Window {
			delete(l.attempts, key)
		}
	}
}

// TrackedSourceCount reports how many distinct source keys this
// limiter currently holds state for. Mainly useful for tests and
// observability (e.g. exposing it via a metrics endpoint) rather than
// anything callers need for rate-limiting decisions themselves.
func (l *LoginLimiter) TrackedSourceCount() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.attempts)
}
