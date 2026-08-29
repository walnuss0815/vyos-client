package vyos_test

import (
	"context"
	"runtime"
	"strings"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

func TestShowLogTail(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}

	fake.ShowOutputs["log ssh"] = "line1\nline2\nline3\nline4\nline5\n"

	t.Run("returns every line untruncated when maxLines is generous", func(t *testing.T) {
		got, err := c.ShowLogTail(context.Background(), []string{"log", "ssh"}, 10)
		if err != nil {
			t.Fatalf("ShowLogTail: %v", err)
		}
		want := []string{"line1", "line2", "line3", "line4", "line5"}
		if !stringSlicesEqual(got.Lines, want) {
			t.Errorf("Lines = %v, want %v", got.Lines, want)
		}
		if got.Truncated {
			t.Errorf("Truncated = true, want false")
		}
	})

	t.Run("keeps only the most recent maxLines lines, in chronological order", func(t *testing.T) {
		got, err := c.ShowLogTail(context.Background(), []string{"log", "ssh"}, 2)
		if err != nil {
			t.Fatalf("ShowLogTail: %v", err)
		}
		want := []string{"line4", "line5"}
		if !stringSlicesEqual(got.Lines, want) {
			t.Errorf("Lines = %v, want %v", got.Lines, want)
		}
		if !got.Truncated {
			t.Errorf("Truncated = false, want true")
		}
	})

	t.Run("an empty log returns an empty, non-nil slice and no truncation", func(t *testing.T) {
		fake.ShowOutputs["log empty"] = ""
		got, err := c.ShowLogTail(context.Background(), []string{"log", "empty"}, 500)
		if err != nil {
			t.Fatalf("ShowLogTail: %v", err)
		}
		if got.Lines == nil {
			t.Errorf("Lines = nil, want non-nil empty slice")
		}
		if len(got.Lines) != 0 {
			t.Errorf("Lines = %v, want empty", got.Lines)
		}
		if got.Truncated {
			t.Errorf("Truncated = true, want false")
		}
	})

	// Regression test: a negative maxLines used to panic
	// ("slice bounds out of range") via len(lines)-maxLines exceeding
	// len(lines). The current caller (api/log_handlers.go) already
	// clamps its own value before calling this, but ShowLogTail is
	// exported and shouldn't crash the request goroutine if some
	// future caller doesn't.
	for _, maxLines := range []int{0, -1, -500} {
		t.Run("does not panic on a non-positive maxLines", func(t *testing.T) {
			got, err := c.ShowLogTail(context.Background(), []string{"log", "ssh"}, maxLines)
			if err != nil {
				t.Fatalf("ShowLogTail(maxLines=%d): %v", maxLines, err)
			}
			if len(got.Lines) != 0 {
				t.Errorf("ShowLogTail(maxLines=%d).Lines = %v, want empty", maxLines, got.Lines)
			}
			if !got.Truncated {
				t.Errorf("ShowLogTail(maxLines=%d).Truncated = false, want true (there was real log content that got dropped entirely)", maxLines)
			}
		})
	}
}

func TestShowLogTailBounded(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}

	t.Run("dispatches to 'log tail <n>' and un-reverses the newest-first result back into chronological order", func(t *testing.T) {
		// A real `show log tail 3` (journalctl --reverse --lines 3)
		// returns newest-first.
		fake.ShowOutputs["log tail 3"] = "line3\nline2\nline1\n"

		got, err := c.ShowLogTailBounded(context.Background(), 3)
		if err != nil {
			t.Fatalf("ShowLogTailBounded: %v", err)
		}
		want := []string{"line1", "line2", "line3"}
		if !stringSlicesEqual(got.Lines, want) {
			t.Errorf("Lines = %v, want %v", got.Lines, want)
		}
	})

	t.Run("reports truncated when VyOS returned exactly maxLines (more history likely exists)", func(t *testing.T) {
		fake.ShowOutputs["log tail 2"] = "lineB\nlineA\n"

		got, err := c.ShowLogTailBounded(context.Background(), 2)
		if err != nil {
			t.Fatalf("ShowLogTailBounded: %v", err)
		}
		if !got.Truncated {
			t.Errorf("Truncated = false, want true (got exactly maxLines back)")
		}
	})

	t.Run("reports not truncated when VyOS returned fewer than maxLines (that's everything there is)", func(t *testing.T) {
		fake.ShowOutputs["log tail 100"] = "only-line\n"

		got, err := c.ShowLogTailBounded(context.Background(), 100)
		if err != nil {
			t.Fatalf("ShowLogTailBounded: %v", err)
		}
		if got.Truncated {
			t.Errorf("Truncated = true, want false (fewer lines than requested came back)")
		}
	})

	t.Run("an empty log returns an empty, non-nil slice and no truncation", func(t *testing.T) {
		fake.ShowOutputs["log tail 5"] = ""

		got, err := c.ShowLogTailBounded(context.Background(), 5)
		if err != nil {
			t.Fatalf("ShowLogTailBounded: %v", err)
		}
		if got.Lines == nil {
			t.Errorf("Lines = nil, want non-nil empty slice")
		}
		if len(got.Lines) != 0 {
			t.Errorf("Lines = %v, want empty", got.Lines)
		}
		if got.Truncated {
			t.Errorf("Truncated = true, want false")
		}
	})
}

func stringSlicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestLogFacilitiesAndPriorities(t *testing.T) {
	// Sanity checks, not exhaustive - these two lists are validated
	// against by the API handler (see api.handleLogs), so a typo here
	// would silently reject a legitimate value.
	if !contains(vyos.LogFacilities, "local7") {
		t.Errorf("LogFacilities missing 'local7'")
	}
	if !contains(vyos.LogPriorities, "debug") {
		t.Errorf("LogPriorities missing 'debug'")
	}
	if contains(vyos.LogPriorities, "warn") {
		t.Errorf("LogPriorities contains 'warn' - VyOS/syslog spells it 'warning'")
	}
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// Guards against a regression where splitLogLines (unexported, so
// only reachable indirectly through ShowLogTail here) would strip more
// than one trailing newline, silently dropping a genuinely blank last
// log line.
func TestShowLogTail_OnlyStripsOneTrailingNewline(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}
	fake.ShowOutputs["log ssh"] = "line1\n\n"

	got, err := c.ShowLogTail(context.Background(), []string{"log", "ssh"}, 10)
	if err != nil {
		t.Fatalf("ShowLogTail: %v", err)
	}
	want := []string{"line1", ""}
	if !stringSlicesEqual(got.Lines, want) {
		t.Errorf("Lines = %v, want %v", got.Lines, want)
	}
}

// TestShowLogTail_TruncationDoesNotRetainOriginalBackingArray is a
// regression test: truncating via a bare re-slice (or even
// slices.Clone alone, which only copies the *array of string headers*
// - each individual header still points into whatever backing byte
// array the original strings came from) kept every discarded early
// log line's own byte data reachable through the GC for as long as
// the small, "truncated" result was held, since strings.Split's
// per-line substrings all view into the single full log response they
// were split out of.
//
// Uses many short, distinct-content padding lines (rather than one
// giant line) so the total fetched volume is large while the *kept*
// tail (maxLines=5) stays tiny - decoupling "the source is huge" from
// "much is legitimately retained", the same technique used for the
// analogous fix in files_test.go.
func TestShowLogTail_TruncationDoesNotRetainOriginalBackingArray(t *testing.T) {
	const paddingLines = 300_000 // ~20MB of fetched log text
	const maxLines = 5

	fake := testutil.New("test-key")
	defer fake.Close()
	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}

	// Baseline measured before the huge fixture string even exists,
	// not just before the ShowLogTail call - otherwise dropping
	// fake.ShowOutputs's own ~20MB copy afterward would mask a bug
	// that retains a *different* ~20MB copy of its own (both being
	// roughly the same size, the delta could net out close to zero
	// either way). Two GC passes, here and below: a single pass can
	// leave a just-freed large allocation's memory counted as live for
	// one more cycle in practice, which flaked this test's first run.
	runtime.GC()
	runtime.GC()
	var before runtime.MemStats
	runtime.ReadMemStats(&before)

	var got *vyos.LogLines
	func() {
		var b strings.Builder
		for i := 0; i < paddingLines; i++ {
			b.WriteString("this is a padding log line to inflate the fetched response size\n")
		}
		b.WriteString("line1\nline2\nline3\nline4\nline5\n")
		fake.ShowOutputs["log ssh"] = b.String()

		got, err = c.ShowLogTail(context.Background(), []string{"log", "ssh"}, maxLines)
		if err != nil {
			t.Fatalf("ShowLogTail: %v", err)
		}
		// Release the fake server's own copy of the huge fetched text
		// - it would otherwise stay reachable via fake.ShowOutputs
		// for the rest of the test regardless of what ShowLogTail
		// itself retains.
		delete(fake.ShowOutputs, "log ssh")
	}()

	runtime.GC()
	runtime.GC()
	var after runtime.MemStats
	runtime.ReadMemStats(&after)

	want := []string{"line1", "line2", "line3", "line4", "line5"}
	if !stringSlicesEqual(got.Lines, want) {
		t.Fatalf("test setup assumption broken: Lines = %v, want %v", got.Lines, want)
	}
	grew := int64(after.HeapAlloc) - int64(before.HeapAlloc)
	const maxExpectedGrowth = 4 * 1024 * 1024
	if grew > maxExpectedGrowth {
		t.Errorf("heap grew by %d bytes (%.1fMB) across the call, want < %.1fMB - the fetched log response appears to still be reachable through the truncated result", grew, float64(grew)/1024/1024, float64(maxExpectedGrowth)/1024/1024)
	}
}
