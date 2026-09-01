package auth_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/walnuss0815/vyos-client/backend/internal/auth"
)

func TestRequestLimiter_AllowsUpToMax(t *testing.T) {
	l := auth.NewRequestLimiter(3, time.Minute)
	for i := range 3 {
		if !l.Allow("alice") {
			t.Fatalf("request %d: expected Allow to succeed within the quota", i+1)
		}
	}
}

func TestRequestLimiter_BlocksAfterMax(t *testing.T) {
	l := auth.NewRequestLimiter(3, time.Minute)
	for range 3 {
		l.Allow("alice")
	}
	if l.Allow("alice") {
		t.Fatal("expected the 4th request within the window to be blocked")
	}
}

func TestRequestLimiter_KeysAreIndependent(t *testing.T) {
	l := auth.NewRequestLimiter(1, time.Minute)
	if !l.Allow("alice") {
		t.Fatal("expected alice's first request to be allowed")
	}
	if !l.Allow("bob") {
		t.Fatal("expected bob's first request to be allowed independently of alice's quota")
	}
	if l.Allow("alice") {
		t.Fatal("expected alice's second request to still be blocked")
	}
}

func TestRequestLimiter_AllowsAgainAfterWindowElapses(t *testing.T) {
	l := auth.NewRequestLimiter(1, 10*time.Millisecond)
	if !l.Allow("alice") {
		t.Fatal("expected the first request to be allowed")
	}
	if l.Allow("alice") {
		t.Fatal("expected the second request within the window to be blocked")
	}
	time.Sleep(20 * time.Millisecond)
	if !l.Allow("alice") {
		t.Error("expected a request past the window to be allowed again")
	}
}

func TestRequestLimiter_RollingWindowNotFixed(t *testing.T) {
	// Confirms this is a genuine rolling window (each hit expires
	// independently window after IT happened), not a fixed window
	// that resets all-at-once: use up the quota with hits spread
	// across time, and confirm only the oldest hits expire first.
	l := auth.NewRequestLimiter(2, 30*time.Millisecond)
	if !l.Allow("alice") {
		t.Fatal("expected 1st request to be allowed")
	}
	time.Sleep(20 * time.Millisecond)
	if !l.Allow("alice") {
		t.Fatal("expected 2nd request to be allowed (quota is 2)")
	}
	if l.Allow("alice") {
		t.Fatal("expected 3rd request to be blocked - quota exhausted")
	}
	// The 1st hit (now ~30ms+ old) should have expired, freeing one
	// slot, while the 2nd hit (still ~10ms old) has not.
	time.Sleep(15 * time.Millisecond)
	if !l.Allow("alice") {
		t.Error("expected a request to be allowed once the oldest hit rolled out of the window")
	}
}

func TestRequestLimiter_EvictsExpiredKeysOnceMaxTrackedKeysReached(t *testing.T) {
	l := auth.NewRequestLimiter(1, 10*time.Millisecond)
	l.MaxTrackedKeys = 3

	for i := range 3 {
		l.Allow(fmt.Sprintf("user-%d", i))
	}
	if got := l.TrackedKeyCount(); got != 3 {
		t.Fatalf("TrackedKeyCount() = %d, want 3 before eviction", got)
	}

	time.Sleep(20 * time.Millisecond) // past Window - all 3 are now stale

	l.Allow("user-99")

	if got := l.TrackedKeyCount(); got != 1 {
		t.Fatalf("TrackedKeyCount() = %d, want 1 after evicting 3 stale keys", got)
	}
}

func TestRequestLimiter_DoesNotEvictStillActiveKeys(t *testing.T) {
	l := auth.NewRequestLimiter(10, time.Hour) // won't expire during this test
	l.MaxTrackedKeys = 3

	for i := range 4 {
		l.Allow(fmt.Sprintf("user-%d", i))
	}
	if got := l.TrackedKeyCount(); got != 4 {
		t.Fatalf("TrackedKeyCount() = %d, want 4 - none of these are stale yet", got)
	}
}
